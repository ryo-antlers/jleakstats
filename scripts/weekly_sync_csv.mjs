// 週次 CSV 同期: data/players-active-2026.csv の差分を反映
//
// 実行: node --env-file=.env.local scripts/weekly_sync_csv.mjs
//        node --env-file=.env.local scripts/weekly_sync_csv.mjs --dry-run
//        node --env-file=.env.local scripts/weekly_sync_csv.mjs --force-abolish    # 抹消閾値超えても強制実行
//
// 動作:
//   1. CSV (data/players-active-2026.csv) を読み込み、ハッシュ計算
//   2. 前回処理時のハッシュと比較 → 同じなら早期終了
//   3. 各行を canonical に紐付け (Step 4 と同ロジック)
//   4. 差分検出:
//      - 新加入/復活 (is_active=true 化)
//      - 移籍 (team_id 変化)
//      - 抹消候補 (CSV にない is_active=true) — 閾値チェック
//   5. 抹消閾値:
//      - 0〜5人:   自動適用
//      - 6〜19人:  警告 + 自動適用
//      - 20人以上: 即停止 (--force-abolish で強制)
//   6. JSON サマリ出力 (email body 用)

import { Pool, neonConfig } from '@neondatabase/serverless'
import { readFileSync, statSync } from 'fs'
import { createHash } from 'crypto'
import ws from 'ws'

// Node.js 環境では WebSocket をパッケージで明示
neonConfig.webSocketConstructor = ws

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const DRY_RUN = process.argv.includes('--dry-run')
const FORCE_ABOLISH = process.argv.includes('--force-abolish')
const CSV_PATH = 'data/players-active-2026.csv'

const ABOLISH_AUTO_THRESHOLD = 5
const ABOLISH_HARD_LIMIT = 20

const normalize = s => s ? s.normalize('NFKC').replace(/[\s　・]+/g, '').toLowerCase() : null

function parseDob(s) {
  if (!s) return null
  const m = s.trim().match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.length > 0)
  const headers = lines[0].split(',').map(h => h.trim())
  const rows = lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim())
    const o = {}
    headers.forEach((h, i) => o[h] = cols[i] ?? '')
    return o
  })
  return { headers, rows }
}

console.error(`\n=== Weekly CSV Sync ${DRY_RUN ? '(DRY-RUN)' : '(APPLY)'} ===`)

// ─── CSV 読み込み + ハッシュ計算 ──────────────────
const csvText = readFileSync(CSV_PATH, 'utf-8')
const csvHash = createHash('sha256').update(csvText).digest('hex').slice(0, 16)
const csvMtime = statSync(CSV_PATH).mtime.toISOString()
console.error(`  CSV: ${CSV_PATH} (hash=${csvHash}, mtime=${csvMtime})`)

// 前回処理時のハッシュをチェック (canonical_audit_log に記録)
const lastSync = (await pool.query(`
  SELECT payload FROM canonical_audit_log
  WHERE action = 'weekly_sync_csv'
  ORDER BY id DESC LIMIT 1
`)).rows[0]
const lastHash = lastSync?.payload?.csv_hash
if (lastHash === csvHash) {
  console.error('  → CSVに変更なし (前回と同じハッシュ)。スキップ。')
  console.log(JSON.stringify({
    summary: { skipped: true, reason: 'csv_unchanged', csv_hash: csvHash },
  }, null, 2))
  await pool.end()
  process.exit(0)
}

const { rows } = parseCsv(csvText)
console.error(`  CSV 件数: ${rows.length}`)

// ─── DB 状態のロード ──────────────────────────
const teamRows = (await pool.query(`SELECT id, name_ja, short_name, abbr FROM teams_master`)).rows
const teamByNormName = new Map()
for (const t of teamRows) {
  for (const v of [t.name_ja, t.short_name, t.abbr]) {
    const k = normalize(v)
    if (k && !teamByNormName.has(k)) teamByNormName.set(k, t.id)
  }
}

const aliasRows = (await pool.query(`SELECT canonical_id, normalized FROM player_aliases`)).rows
const canonicalsByNorm = new Map()
for (const r of aliasRows) {
  if (!canonicalsByNorm.has(r.normalized)) canonicalsByNorm.set(r.normalized, new Set())
  canonicalsByNorm.get(r.normalized).add(r.canonical_id)
}

const pmRows = (await pool.query(`
  SELECT id, name_ja, dob, team_id, no, is_active, canonical_id FROM players_master
`)).rows
const playerById = new Map(pmRows.map(r => [r.id, r]))

const jpExtRows = (await pool.query(`
  SELECT canonical_id, external_id FROM player_external_ids WHERE source='j-league-jp'
`)).rows
const canonicalByJpId = new Map(jpExtRows.map(r => [r.external_id, r.canonical_id]))

const NEW_CANONICAL_ID_START = 10_000_000
const maxId = Number((await pool.query(`SELECT COALESCE(MAX(id), ${NEW_CANONICAL_ID_START - 1}) AS m FROM players_master WHERE id >= ${NEW_CANONICAL_ID_START}`)).rows[0].m)
let nextCanonicalId = maxId + 1

// CSV ヘッダ吸収
function findHeader(...candidates) {
  return candidates.find(c => Object.keys(rows[0] ?? {}).includes(c)) ?? null
}
const H = {
  jleague: findHeader('JリーグID', 'J-League ID', 'jleague_id'),
  name: findHeader('選手名', '名前', 'name_ja'),
  team: findHeader('クラブ名', 'チーム名', 'チーム'),
  no: findHeader('背番号', '番号', 'no'),
  dob: findHeader('生年月日', 'dob', '誕生日'),
}

// ─── マッチング ────────────────────────────────────
const ops = {
  newCanonicals: [],
  newJpLinks: [],
  newAliases: [],
  activations: [],   // is_active=true + team/no 更新
  transfers: [],     // team_id 変化
  abolishCandidates: [],  // CSVにない is_active=true
  errors: [],
}
const csvCanonicals = new Set()
const toCanonical = (id) => playerById.get(id)?.canonical_id ?? id

for (const row of rows) {
  const jleagueId = row[H.jleague]?.trim()
  const nameJa = row[H.name]?.trim()
  const teamName = row[H.team]?.trim()
  const noRaw = H.no ? row[H.no]?.trim() : ''
  const noParsed = noRaw ? parseInt(noRaw, 10) : null
  const no = Number.isFinite(noParsed) ? noParsed : null
  const dob = H.dob ? parseDob(row[H.dob]) : null

  if (!jleagueId || !nameJa || !teamName) {
    ops.errors.push({ row, reason: '必須列空欄' })
    continue
  }
  const teamId = teamByNormName.get(normalize(teamName))
  if (!teamId) {
    ops.errors.push({ row, reason: `team未解決: ${teamName}` })
    continue
  }

  // canonical 解決
  let canonicalId = canonicalByJpId.get(jleagueId)
  if (!canonicalId) {
    const norm = normalize(nameJa)
    const aliasMatches = [...(canonicalsByNorm.get(norm) ?? [])]
    const candidateCanonicals = [...new Set(aliasMatches.map(toCanonical))]
    const teamMatched = candidateCanonicals.filter(c =>
      aliasMatches.some(aid => {
        const pm = playerById.get(aid)
        return pm && toCanonical(aid) === c && pm.team_id === teamId
      }) || (playerById.get(c)?.team_id === teamId)
    )

    if (teamMatched.length === 1) canonicalId = teamMatched[0]
    else if (teamMatched.length > 1 && dob) {
      const dobMatched = teamMatched.filter(c => {
        const pm = playerById.get(c)
        if (!pm?.dob) return false
        return new Date(pm.dob.getTime() + 9*3600*1000).toISOString().slice(0,10) === dob
      })
      if (dobMatched.length === 1) canonicalId = dobMatched[0]
    } else if (candidateCanonicals.length === 1) {
      canonicalId = candidateCanonicals[0]
    } else if (candidateCanonicals.length > 1 && dob) {
      const dobMatched = candidateCanonicals.filter(c => {
        const pm = playerById.get(c)
        if (!pm?.dob) return false
        return new Date(pm.dob.getTime() + 9*3600*1000).toISOString().slice(0,10) === dob
      })
      if (dobMatched.length === 1) canonicalId = dobMatched[0]
    }

    if (!canonicalId) {
      // 完全新規 (CSV にあって DB にない)
      canonicalId = nextCanonicalId++
      ops.newCanonicals.push({ id: canonicalId, name_ja: nameJa, team_id: teamId, no, dob })
    }
  }

  csvCanonicals.add(canonicalId)

  // J-League ID 紐付け (なければ追加)
  if (!canonicalByJpId.has(jleagueId)) {
    ops.newJpLinks.push({ canonical_id: canonicalId, jleague_id: jleagueId })
  }

  // alias (CSVの表記を念のため登録)
  const norm = normalize(nameJa)
  if (norm) {
    ops.newAliases.push({ canonical_id: canonicalId, name_ja: nameJa, normalized: norm })
  }

  // 既存 canonical 行と比較して active/transfer 判定
  const pm = playerById.get(canonicalId)
  if (pm) {
    if (!pm.is_active) {
      // 復活 or 新加入
      ops.activations.push({ id: canonicalId, name_ja: pm.name_ja, team_id: teamId, no, dob, prev: 'inactive' })
    } else if (pm.team_id !== teamId) {
      // 移籍
      ops.transfers.push({
        id: canonicalId, name_ja: pm.name_ja,
        from_team_id: pm.team_id, to_team_id: teamId, no,
      })
    } else if (pm.no !== no) {
      // 背番号変更
      ops.activations.push({ id: canonicalId, name_ja: pm.name_ja, team_id: teamId, no, dob, prev: 'no_change' })
    }
  }
  // 新規 canonical は ops.newCanonicals で扱われる
}

// 抹消候補検出
const currentActive = pmRows.filter(p => p.is_active && (p.canonical_id == null || p.canonical_id === p.id))
for (const p of currentActive) {
  if (!csvCanonicals.has(p.id)) {
    ops.abolishCandidates.push({ id: p.id, name_ja: p.name_ja, team_id: p.team_id })
  }
}

console.error('\n  操作プラン:')
console.error(`    新規 canonical    : ${ops.newCanonicals.length}件`)
console.error(`    新規 JリーグID紐付 : ${ops.newJpLinks.length}件`)
console.error(`    新規 alias        : ${ops.newAliases.length}件`)
console.error(`    activations       : ${ops.activations.length}件`)
console.error(`    transfers         : ${ops.transfers.length}件`)
console.error(`    抹消候補          : ${ops.abolishCandidates.length}件`)
console.error(`    errors            : ${ops.errors.length}件`)

// 抹消閾値チェック
if (ops.abolishCandidates.length >= ABOLISH_HARD_LIMIT && !FORCE_ABOLISH) {
  console.error(`\n✗ 抹消候補が ${ops.abolishCandidates.length}件 (閾値 ${ABOLISH_HARD_LIMIT}) を超過。実行を中止。`)
  console.error('   --force-abolish フラグで強制実行可能')
  console.log(JSON.stringify({
    summary: { aborted: true, reason: 'abolish_threshold_exceeded', abolish_count: ops.abolishCandidates.length },
    abolish_candidates: ops.abolishCandidates,
  }, null, 2))
  await pool.end()
  process.exit(2) // exit code 2 = abort
}

const summary = {
  ran_at: new Date().toISOString(),
  csv_hash: csvHash,
  csv_mtime: csvMtime,
  csv_rows: rows.length,
  new_canonicals: ops.newCanonicals.length,
  new_jp_links: ops.newJpLinks.length,
  activations: ops.activations.length,
  transfers: ops.transfers.length,
  abolished: ops.abolishCandidates.length,
  errors: ops.errors.length,
  abolish_warning: ops.abolishCandidates.length > ABOLISH_AUTO_THRESHOLD,
}

if (DRY_RUN) {
  console.error('\n[DRY-RUN] DB変更なし')
  console.log(JSON.stringify({ summary, ...ops }, null, 2))
  await pool.end()
  process.exit(0)
}

// ─── APPLY ───────────────────────────────────────
const client = await pool.connect()
try {
  await client.query('BEGIN')

  // 新規 canonical
  for (const c of ops.newCanonicals) {
    await client.query(
      `INSERT INTO players_master (id, name_ja, team_id, no, dob, is_active, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [c.id, c.name_ja, c.team_id, c.no, c.dob]
    )
  }

  // J-League ID 紐付け
  for (const r of ops.newJpLinks) {
    await client.query(
      `INSERT INTO player_external_ids (canonical_id, source, external_id)
       VALUES ($1, 'j-league-jp', $2) ON CONFLICT (source, external_id) DO NOTHING`,
      [r.canonical_id, r.jleague_id]
    )
  }

  // alias
  for (const a of ops.newAliases) {
    await client.query(
      `INSERT INTO player_aliases (canonical_id, name_ja, normalized, source)
       VALUES ($1, $2, $3, 'csv-weekly') ON CONFLICT (canonical_id, normalized) DO NOTHING`,
      [a.canonical_id, a.name_ja, a.normalized]
    )
  }

  // activations
  for (const u of ops.activations) {
    const sets = ['is_active = true', `team_id = $1`]
    const params = [u.team_id]
    if (u.no != null) { sets.push(`no = $${params.length+1}`); params.push(u.no) }
    if (u.dob != null) { sets.push(`dob = COALESCE(dob, $${params.length+1})`); params.push(u.dob) }
    sets.push('updated_at = NOW()')
    params.push(u.id)
    await client.query(
      `UPDATE players_master SET ${sets.join(', ')} WHERE id = $${params.length}`,
      params
    )
  }

  // transfers
  for (const u of ops.transfers) {
    await client.query(
      `UPDATE players_master SET team_id = $1, no = $2, updated_at = NOW() WHERE id = $3`,
      [u.to_team_id, u.no, u.id]
    )
  }

  // 抹消
  for (const u of ops.abolishCandidates) {
    await client.query(
      `UPDATE players_master SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [u.id]
    )
  }

  // audit log
  await client.query(
    `INSERT INTO canonical_audit_log (action, payload, actor) VALUES ('weekly_sync_csv', $1::jsonb, 'cron')`,
    [JSON.stringify(summary)]
  )

  await client.query('COMMIT')
  console.error('  ✓ COMMIT 成功')
} catch (e) {
  await client.query('ROLLBACK')
  console.error('  ✗ ROLLBACK:', e.message)
  process.exit(1)
} finally {
  client.release()
}

console.log(JSON.stringify({ summary, ...ops }, null, 2))
await pool.end()
