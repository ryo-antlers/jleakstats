// 週次 CSV 同期: data/players-active-2026.csv の差分を反映
//
// 実行: node --env-file=.env.local scripts/weekly_sync_csv.mjs
//        node --env-file=.env.local scripts/weekly_sync_csv.mjs --dry-run
//        node --env-file=.env.local scripts/weekly_sync_csv.mjs --force-abolish

import { neon } from '@neondatabase/serverless'
import { readFileSync, statSync } from 'fs'
import { createHash } from 'crypto'

const sql = neon(process.env.DATABASE_URL)
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

const csvText = readFileSync(CSV_PATH, 'utf-8')
const csvHash = createHash('sha256').update(csvText).digest('hex').slice(0, 16)
const csvMtime = statSync(CSV_PATH).mtime.toISOString()
console.error(`  CSV: ${CSV_PATH} (hash=${csvHash}, mtime=${csvMtime})`)

const lastSyncRows = await sql`
  SELECT payload FROM canonical_audit_log
  WHERE action = 'weekly_sync_csv'
  ORDER BY id DESC LIMIT 1
`
const lastHash = lastSyncRows[0]?.payload?.csv_hash
if (lastHash === csvHash) {
  console.error('  → CSVに変更なし。スキップ。')
  console.log(JSON.stringify({
    summary: { skipped: true, reason: 'csv_unchanged', csv_hash: csvHash },
  }, null, 2))
  process.exit(0)
}

const { rows } = parseCsv(csvText)
console.error(`  CSV 件数: ${rows.length}`)

// ─── DB 状態のロード ──────────────────────────
const teamRows = await sql`SELECT id, name_ja, short_name, abbr FROM teams_master`
const teamByNormName = new Map()
for (const t of teamRows) {
  for (const v of [t.name_ja, t.short_name, t.abbr]) {
    const k = normalize(v)
    if (k && !teamByNormName.has(k)) teamByNormName.set(k, t.id)
  }
}

const aliasRows = await sql`SELECT canonical_id, normalized FROM player_aliases`
const canonicalsByNorm = new Map()
for (const r of aliasRows) {
  if (!canonicalsByNorm.has(r.normalized)) canonicalsByNorm.set(r.normalized, new Set())
  canonicalsByNorm.get(r.normalized).add(r.canonical_id)
}

const pmRows = await sql`
  SELECT id, name_ja, dob, team_id, no, is_active, canonical_id FROM players_master
`
const playerById = new Map(pmRows.map(r => [r.id, r]))

const jpExtRows = await sql`
  SELECT canonical_id, external_id FROM player_external_ids WHERE source='j-league-jp'
`
const canonicalByJpId = new Map(jpExtRows.map(r => [r.external_id, r.canonical_id]))

const NEW_CANONICAL_ID_START = 10_000_000
const maxIdRow = await sql`SELECT COALESCE(MAX(id), ${NEW_CANONICAL_ID_START - 1}) AS m FROM players_master WHERE id >= ${NEW_CANONICAL_ID_START}`
let nextCanonicalId = Number(maxIdRow[0].m) + 1

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

const ops = {
  newCanonicals: [], newJpLinks: [], newAliases: [],
  activations: [], transfers: [], abolishCandidates: [], errors: [],
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

  if (!jleagueId || !nameJa || !teamName) { ops.errors.push({ row, reason: '必須列空欄' }); continue }
  const teamId = teamByNormName.get(normalize(teamName))
  if (!teamId) { ops.errors.push({ row, reason: `team未解決: ${teamName}` }); continue }

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
    } else if (candidateCanonicals.length === 1) canonicalId = candidateCanonicals[0]
    else if (candidateCanonicals.length > 1 && dob) {
      const dobMatched = candidateCanonicals.filter(c => {
        const pm = playerById.get(c)
        if (!pm?.dob) return false
        return new Date(pm.dob.getTime() + 9*3600*1000).toISOString().slice(0,10) === dob
      })
      if (dobMatched.length === 1) canonicalId = dobMatched[0]
    }

    if (!canonicalId) {
      canonicalId = nextCanonicalId++
      ops.newCanonicals.push({ id: canonicalId, name_ja: nameJa, team_id: teamId, no, dob })
    }
  }

  csvCanonicals.add(canonicalId)

  if (!canonicalByJpId.has(jleagueId)) {
    ops.newJpLinks.push({ canonical_id: canonicalId, jleague_id: jleagueId })
  }
  const norm = normalize(nameJa)
  if (norm) ops.newAliases.push({ canonical_id: canonicalId, name_ja: nameJa, normalized: norm })

  const pm = playerById.get(canonicalId)
  if (pm) {
    if (!pm.is_active) {
      ops.activations.push({ id: canonicalId, name_ja: pm.name_ja, team_id: teamId, no, dob, prev: 'inactive' })
    } else if (pm.team_id !== teamId) {
      ops.transfers.push({ id: canonicalId, name_ja: pm.name_ja, from_team_id: pm.team_id, to_team_id: teamId, no })
    } else if (pm.no !== no) {
      ops.activations.push({ id: canonicalId, name_ja: pm.name_ja, team_id: teamId, no, dob, prev: 'no_change' })
    }
  }
}

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

if (ops.abolishCandidates.length >= ABOLISH_HARD_LIMIT && !FORCE_ABOLISH) {
  console.error(`\n✗ 抹消候補が ${ops.abolishCandidates.length}件 超過。中止。`)
  console.log(JSON.stringify({
    summary: { aborted: true, reason: 'abolish_threshold_exceeded', abolish_count: ops.abolishCandidates.length },
    abolish_candidates: ops.abolishCandidates,
  }, null, 2))
  process.exit(2)
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
  process.exit(0)
}

// ─── APPLY: sql.transaction で 1 トランザクション ─
const queries = []

for (const c of ops.newCanonicals) {
  queries.push(sql`
    INSERT INTO players_master (id, name_ja, team_id, no, dob, is_active, updated_at)
    VALUES (${c.id}, ${c.name_ja}, ${c.team_id}, ${c.no}, ${c.dob}, true, NOW())
    ON CONFLICT (id) DO NOTHING
  `)
}
for (const r of ops.newJpLinks) {
  queries.push(sql`
    INSERT INTO player_external_ids (canonical_id, source, external_id)
    VALUES (${r.canonical_id}, 'j-league-jp', ${r.jleague_id})
    ON CONFLICT (source, external_id) DO NOTHING
  `)
}
for (const a of ops.newAliases) {
  queries.push(sql`
    INSERT INTO player_aliases (canonical_id, name_ja, normalized, source)
    VALUES (${a.canonical_id}, ${a.name_ja}, ${a.normalized}, 'csv-weekly')
    ON CONFLICT (canonical_id, normalized) DO NOTHING
  `)
}
for (const u of ops.activations) {
  queries.push(sql`
    UPDATE players_master
    SET is_active = true,
        team_id = ${u.team_id},
        no = COALESCE(${u.no}, no),
        dob = COALESCE(dob, ${u.dob}),
        updated_at = NOW()
    WHERE id = ${u.id}
  `)
}
for (const u of ops.transfers) {
  queries.push(sql`
    UPDATE players_master SET team_id = ${u.to_team_id}, no = ${u.no}, updated_at = NOW()
    WHERE id = ${u.id}
  `)
}
for (const u of ops.abolishCandidates) {
  queries.push(sql`UPDATE players_master SET is_active = false, updated_at = NOW() WHERE id = ${u.id}`)
}

queries.push(sql`
  INSERT INTO canonical_audit_log (action, payload, actor)
  VALUES ('weekly_sync_csv', ${JSON.stringify(summary)}::jsonb, 'cron')
`)

if (queries.length > 0) {
  await sql.transaction(queries)
  console.error(`  ✓ COMMIT 成功 (${queries.length} queries)`)
}

console.log(JSON.stringify({ summary, ...ops }, null, 2))
