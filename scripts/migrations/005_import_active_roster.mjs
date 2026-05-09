// Phase 2 / Step 4: ユーザースプレッドシートCSV から 2026 active 選手を取り込み
//
// CSV フォーマット (data/players-active-2026.csv):
//   背番号,クラブ名,選手名,生年月日,JリーグID
//   1,鹿島アントラーズ,早川 友基,1999/3/3,1632225
//
// やること:
//   1. CSV 読み込み
//   2. クラブ名 → team_id 解決
//   3. 各行を canonical に紐付け
//      a. JリーグID (jleague-jp 7桁) で player_external_ids 検索
//      b. 名前 + チーム + dob で player_aliases / players_master 検索
//      c. 名前 + チーム のみで検索
//      d. マッチなしは新規 canonical (10M+ 続き)
//   4. is_active=true / team_id 更新 / 背番号 (no) 更新
//   5. JリーグID (7桁) を player_external_ids に source='j-league-jp' で登録
//   6. 取り込み後、CSVに含まれない is_active=true の選手は警告表示 (引退/移籍離脱候補)
//
// 実行:
//   node --env-file=.env.local scripts/migrations/005_import_active_roster.mjs            # DRY-RUN
//   node --env-file=.env.local scripts/migrations/005_import_active_roster.mjs --apply    # 本実行

import { Pool } from '@neondatabase/serverless'
import { readFileSync } from 'fs'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const APPLY = process.argv.includes('--apply')
const MODE = APPLY ? 'APPLY' : 'DRY-RUN'

const CSV_PATH = 'data/players-active-2026.csv'
const NEW_CANONICAL_ID_START = 10_000_000  // SFIX03 取り込みと同じレンジ (max値+1から続ける)

const normalize = s => s ? s.normalize('NFKC').replace(/[\s　・]+/g, '').toLowerCase() : null

// "1999/3/3" → "1999-03-03"
function parseDob(s) {
  if (!s) return null
  const m = s.trim().match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`
}

// CSVパーサ (シンプル、引用符対応)
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

console.log(`\n=== Phase 2 Step 4: アクティブ選手CSV取り込み (${MODE}) ===\n`)

// ─── CSV ロード ──────────────────────────
const csvText = readFileSync(CSV_PATH, 'utf-8')
const { headers, rows } = parseCsv(csvText)
console.log(`CSV: ${CSV_PATH}`)
console.log(`ヘッダー: ${headers.join(', ')}`)
console.log(`データ行数: ${rows.length}\n`)

// ─── 必要なヘッダーを推測 (列名ゆらぎ吸収) ─────
function findHeader(...candidates) {
  for (const c of candidates) {
    if (headers.some(h => h === c)) return c
  }
  return null
}
const H = {
  jleague: findHeader('JリーグID', 'J-League ID', 'jleague_id', 'Jリーグ選手ID'),
  name: findHeader('選手名', '名前', 'name_ja'),
  team: findHeader('クラブ名', 'チーム名', 'チーム', 'team_name'),
  no: findHeader('背番号', '番号', 'no', 'number'),
  dob: findHeader('生年月日', 'dob', '誕生日', '生年'),
}
console.log('検出された列マッピング:', H)
const missing = ['jleague','name','team'].filter(k => !H[k])
if (missing.length > 0) {
  console.error(`✗ 必須列が見つからない: ${missing.join(', ')}`)
  process.exit(1)
}

// ─── DB ロード ──────────────────────────
console.log('\nDB ロード中...')
const teamRows = (await pool.query(`SELECT id, name_ja, short_name, abbr FROM teams_master`)).rows
// team名は normalize (NFKC + 空白/中黒除去) して照合 (ＦＣ↔FC など)
const teamByNormName = new Map()
for (const t of teamRows) {
  for (const v of [t.name_ja, t.short_name, t.abbr]) {
    const k = normalize(v)
    if (k && !teamByNormName.has(k)) teamByNormName.set(k, t.id)
  }
}

// 既存 j-league-jp external_id (再実行時に再利用)
const jpExtRows = (await pool.query(`SELECT canonical_id, external_id FROM player_external_ids WHERE source='j-league-jp'`)).rows
const canonicalByJpId = new Map(jpExtRows.map(r => [r.external_id, r.canonical_id]))
console.log(`既存 j-league-jp 紐付け: ${jpExtRows.length}件`)

// 既存 alias (normalized → canonical)
const aliasRows = (await pool.query(`SELECT canonical_id, normalized FROM player_aliases`)).rows
const canonicalsByNorm = new Map()
for (const r of aliasRows) {
  if (!canonicalsByNorm.has(r.normalized)) canonicalsByNorm.set(r.normalized, new Set())
  canonicalsByNorm.get(r.normalized).add(r.canonical_id)
}

// 既存 players_master (canonical 行のみ) を team_id ごとにグループ
const pmRows = (await pool.query(`
  SELECT pm.id, pm.name_ja, pm.dob, pm.team_id, pm.canonical_id
  FROM players_master pm
`)).rows
const playerById = new Map(pmRows.map(r => [r.id, r]))

// 次の canonical_id (新規採番用)
const maxId = (await pool.query(`SELECT COALESCE(MAX(id), ${NEW_CANONICAL_ID_START - 1}) AS m FROM players_master WHERE id >= ${NEW_CANONICAL_ID_START}`)).rows[0].m
let nextCanonicalId = Number(maxId) + 1
console.log(`次の新規 canonical_id 開始: ${nextCanonicalId}`)

// ─── マッチング & 操作プラン構築 ────────────
const opsExternalIds = []  // INSERT player_external_ids
const opsAliases = []      // INSERT player_aliases
const opsActivate = []     // UPDATE players_master (is_active=true, team_id, no)
const opsNewCanonical = [] // INSERT players_master (新規)
const matchStats = { byJpId: 0, byNameTeamDob: 0, byNameTeam: 0, byNameOnly: 0, newCanonical: 0, errors: [] }

const csvCanonicals = new Set()  // CSV内で確定したcanonical_id (引退検出用)

for (const row of rows) {
  const jleagueId = row[H.jleague]?.trim()
  const nameJa = row[H.name]?.trim()
  const teamName = row[H.team]?.trim()
  const noRaw = H.no ? row[H.no]?.trim() : ''
  const noParsed = noRaw ? parseInt(noRaw, 10) : null
  const no = Number.isFinite(noParsed) ? noParsed : null
  const dob = H.dob ? parseDob(row[H.dob]) : null

  if (!jleagueId || !nameJa || !teamName) {
    matchStats.errors.push({ row, reason: '必須列空欄' })
    continue
  }

  // team_id 解決 (normalize で全角/半角ゆらぎ吸収)
  const teamId = teamByNormName.get(normalize(teamName))
  if (!teamId) {
    matchStats.errors.push({ row, reason: `team未解決: ${teamName}` })
    continue
  }

  // (a) JリーグID (jleague-jp) で既存紐付け検索
  let canonicalId = canonicalByJpId.get(jleagueId)
  if (canonicalId) {
    matchStats.byJpId++
  } else {
    // (b)(c)(d) 名前+チーム+dob で検索
    // 重要: alias の canonical_id は古いことがあるので、必ず canonicalize する
    const norm = normalize(nameJa)
    const aliasMatches = [...(canonicalsByNorm.get(norm) ?? [])]
    // ヘルパー: id → 真の canonical
    const toCanonical = (id) => {
      const pm = playerById.get(id)
      return pm?.canonical_id ?? id
    }
    // alias から繋がる全 canonical (重複除去)
    const candidateCanonicals = [...new Set(aliasMatches.map(toCanonical))]
    // team match: canonical 自身 or その alias 行のいずれかが target team
    const teamMatched = candidateCanonicals.filter(canonical => {
      return aliasMatches.some(aid => {
        const pm = playerById.get(aid)
        return pm && toCanonical(aid) === canonical && pm.team_id === teamId
      }) || (playerById.get(canonical)?.team_id === teamId)
    })

    if (teamMatched.length === 1) {
      canonicalId = teamMatched[0]
      // dob 一致確認
      if (dob) {
        const pm = playerById.get(canonicalId)
        const pmDob = pm?.dob ? new Date(pm.dob.getTime() + 9*3600*1000).toISOString().slice(0,10) : null
        if (pmDob && pmDob !== dob) {
          matchStats.errors.push({ row, reason: `dob不一致: CSV=${dob} vs DB=${pmDob}`, severity: 'warning' })
        }
      }
      matchStats.byNameTeam++
    } else if (teamMatched.length > 1 && dob) {
      // 複数候補あり → dob で絞り込み (canonical の dob を見る)
      const dobMatched = teamMatched.filter(canonical => {
        const pm = playerById.get(canonical)
        if (!pm?.dob) return false
        const pmDob = new Date(pm.dob.getTime() + 9*3600*1000).toISOString().slice(0,10)
        return pmDob === dob
      })
      if (dobMatched.length === 1) {
        canonicalId = dobMatched[0]
        matchStats.byNameTeamDob++
      } else {
        matchStats.errors.push({ row, reason: `name+team で複数候補, dob絞込み失敗 (${teamMatched.length}件)` })
        continue
      }
    } else if (candidateCanonicals.length === 1) {
      // チーム不一致だが name 単独で 1 canonical → 移籍してきた可能性
      canonicalId = candidateCanonicals[0]
      matchStats.byNameOnly++
    } else if (candidateCanonicals.length > 1 && dob) {
      // チーム不一致 + 複数候補 → dob で絞り込み
      const dobMatched = candidateCanonicals.filter(canonical => {
        const pm = playerById.get(canonical)
        if (!pm?.dob) return false
        const pmDob = new Date(pm.dob.getTime() + 9*3600*1000).toISOString().slice(0,10)
        return pmDob === dob
      })
      if (dobMatched.length === 1) {
        canonicalId = dobMatched[0]
        matchStats.byNameOnly++
      } else {
        matchStats.errors.push({ row, reason: `name で複数候補, team/dob 絞込み失敗 (${candidateCanonicals.length}件)` })
        continue
      }
    } else if (candidateCanonicals.length > 1) {
      matchStats.errors.push({ row, reason: `name で複数候補, team narrow-down失敗 (${candidateCanonicals.length}件)` })
      continue
    } else {
      // (d) どこにも見つからない → 新規 canonical
      canonicalId = nextCanonicalId++
      opsNewCanonical.push({
        id: canonicalId,
        name_ja: nameJa,
        team_id: teamId,
        no,
        dob,
      })
      matchStats.newCanonical++
    }
  }

  csvCanonicals.add(canonicalId)

  // 操作プラン構築
  // 1) external_ids
  if (!canonicalByJpId.has(jleagueId)) {
    opsExternalIds.push({ canonical_id: canonicalId, jleague_id: jleagueId })
  }

  // 2) alias (CSV の表記を念のため登録)
  const norm = normalize(nameJa)
  if (norm) {
    opsAliases.push({ canonical_id: canonicalId, name_ja: nameJa, normalized: norm, source: 'csv' })
  }

  // 3) activate + team/no 更新 (新規 canonical も含む)
  opsActivate.push({ id: canonicalId, team_id: teamId, no, dob })
}

// ─── 引退検出 ───────────────────────
// 現在 is_active=true なのに CSV に居ない選手
const currentActive = (await pool.query(`
  SELECT pm.id, pm.name_ja, pm.team_id, t.short_name, t.category, t.group_name
  FROM players_master pm
  LEFT JOIN teams_master t ON t.id = pm.team_id
  WHERE pm.is_active = true
    AND COALESCE(pm.canonical_id, pm.id) = pm.id
`)).rows

const retiredCandidates = currentActive.filter(p => !csvCanonicals.has(p.id))

// ─── サマリ表示 ────────────────────
console.log('\n=== マッチング結果 ===')
console.table([
  { strategy: '(a) JリーグID (再実行時)', count: matchStats.byJpId },
  { strategy: '(b) 名前+チーム+dob', count: matchStats.byNameTeamDob },
  { strategy: '(c) 名前+チーム', count: matchStats.byNameTeam },
  { strategy: '(d) 名前のみ (移籍?)', count: matchStats.byNameOnly },
  { strategy: '(e) 新規 canonical', count: matchStats.newCanonical },
  { strategy: 'エラー (スキップ)', count: matchStats.errors.length },
])

console.log('\n=== 操作プラン ===')
console.table([
  { op: 'INSERT players_master (新規canonical)', count: opsNewCanonical.length },
  { op: 'INSERT player_external_ids (j-league-jp)', count: opsExternalIds.length },
  { op: 'INSERT player_aliases (csv source)', count: opsAliases.length },
  { op: 'UPDATE players_master (is_active=true + team/no)', count: opsActivate.length },
  { op: '────', count: '────' },
  { op: '⚠️ 引退候補 (現active で CSVに無い)', count: retiredCandidates.length },
])

if (matchStats.errors.length > 0) {
  console.log('\n=== エラー詳細 (上位10件) ===')
  console.table(matchStats.errors.slice(0, 10))
}

if (retiredCandidates.length > 0) {
  console.log('\n=== 引退候補サンプル (上位10件) ===')
  console.log('注: これらは Step 4 では is_active を変更しません (誤検出防止)。Phase 5以降で手動確認')
  console.table(retiredCandidates.slice(0, 10).map(p => ({
    id: p.id, name: p.name_ja, team: p.short_name, category: p.category
  })))
}

if (!APPLY) {
  console.log('\n--- DRY-RUN モード: DB変更なし ---')
  console.log('本実行: node --env-file=.env.local scripts/migrations/005_import_active_roster.mjs --apply')
  await pool.end()
  process.exit(0)
}

// ─── APPLY ──────────────────────
console.log('\n=== APPLY 開始 (1 トランザクション) ===\n')
const client = await pool.connect()
try {
  await client.query('BEGIN')

  // (a) 新規 canonical INSERT
  console.log(`[a] 新規 canonical INSERT ${opsNewCanonical.length}件...`)
  for (let i = 0; i < opsNewCanonical.length; i += 200) {
    const batch = opsNewCanonical.slice(i, i + 200)
    const values = []
    const params = []
    for (const c of batch) {
      const off = params.length
      values.push(`($${off+1}, $${off+2}, $${off+3}, $${off+4}, $${off+5}, true, NOW())`)
      params.push(c.id, c.name_ja, c.team_id, c.no ?? null, c.dob ?? null)
    }
    if (values.length === 0) continue
    await client.query(
      `INSERT INTO players_master (id, name_ja, team_id, no, dob, is_active, updated_at)
       VALUES ${values.join(',')}
       ON CONFLICT (id) DO NOTHING`,
      params
    )
  }
  console.log(`    ✓ ${opsNewCanonical.length}件`)

  // (b) external_ids
  console.log(`[b] player_external_ids (j-league-jp) INSERT ${opsExternalIds.length}件...`)
  for (let i = 0; i < opsExternalIds.length; i += 500) {
    const batch = opsExternalIds.slice(i, i + 500)
    const values = []
    const params = []
    for (const r of batch) {
      const off = params.length
      values.push(`($${off+1}, 'j-league-jp', $${off+2})`)
      params.push(r.canonical_id, r.jleague_id)
    }
    if (values.length === 0) continue
    await client.query(
      `INSERT INTO player_external_ids (canonical_id, source, external_id)
       VALUES ${values.join(',')}
       ON CONFLICT (source, external_id) DO NOTHING`,
      params
    )
  }
  console.log(`    ✓ ${opsExternalIds.length}件`)

  // (c) aliases
  console.log(`[c] player_aliases (csv source) INSERT ${opsAliases.length}件...`)
  for (let i = 0; i < opsAliases.length; i += 500) {
    const batch = opsAliases.slice(i, i + 500)
    const values = []
    const params = []
    for (const a of batch) {
      const off = params.length
      values.push(`($${off+1}, $${off+2}, $${off+3}, $${off+4})`)
      params.push(a.canonical_id, a.name_ja, a.normalized, a.source)
    }
    if (values.length === 0) continue
    await client.query(
      `INSERT INTO player_aliases (canonical_id, name_ja, normalized, source)
       VALUES ${values.join(',')}
       ON CONFLICT (canonical_id, normalized) DO NOTHING`,
      params
    )
  }
  console.log(`    ✓ ${opsAliases.length}件`)

  // (d) is_active=true + team/no 更新
  console.log(`[d] is_active=true + team/no 更新 ${opsActivate.length}件...`)
  for (const u of opsActivate) {
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
  console.log(`    ✓ ${opsActivate.length}件`)

  // (e) audit_log
  await client.query(
    `INSERT INTO canonical_audit_log (action, payload, actor)
     VALUES ('phase2_step4_csv_import', $1::jsonb, 'migration-script')`,
    [JSON.stringify({
      mode: MODE,
      csv_path: CSV_PATH,
      csv_rows: rows.length,
      stats: matchStats,
      new_canonicals: opsNewCanonical.length,
      external_ids: opsExternalIds.length,
      aliases: opsAliases.length,
      activations: opsActivate.length,
      retired_candidates: retiredCandidates.length,
      ran_at: new Date().toISOString(),
    })]
  )

  await client.query('COMMIT')
  console.log('\n✅ COMMIT 成功 — Phase 2 Step 4 完了')
} catch (err) {
  await client.query('ROLLBACK')
  console.error('\n✗ エラー → ROLLBACK 完了')
  console.error(err)
  process.exit(1)
} finally {
  client.release()
}

// ─── 事後検証 ──────────────────────
console.log('\n=== 事後検証 ===')
const verify = await pool.query(`
  SELECT
    (SELECT COUNT(*) FROM player_external_ids WHERE source='j-league-jp') AS jp_ext_ids,
    (SELECT COUNT(*) FROM players_master WHERE is_active = true) AS active_players,
    (SELECT COUNT(*) FROM players_master WHERE id >= 10000000) AS new_range_players
`)
console.table(verify.rows[0])

await pool.end()
