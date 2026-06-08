// 週次 jleague.jp API 同期: /api/player/list/ で 2026 active 選手を取得し
// 既存 CSV ベース sync (weekly_sync_csv.mjs) と同等の active マーキング + 7桁ID紐付け を行う
//
// 実行: node --env-file=.env.local scripts/weekly_sync_jleague_active.mjs
//        node --env-file=.env.local scripts/weekly_sync_jleague_active.mjs --dry-run
//        node --env-file=.env.local scripts/weekly_sync_jleague_active.mjs --force-abolish
//        node --env-file=.env.local scripts/weekly_sync_jleague_active.mjs --sleep 3000  (default 5000ms)

import { neon } from '@neondatabase/serverless'
import { load } from 'cheerio'
import { setTimeout as sleep } from 'timers/promises'
import { SEASON } from '../lib/season.js'

const sql = neon(process.env.DATABASE_URL)
const DRY_RUN = process.argv.includes('--dry-run')
const FORCE_ABOLISH = process.argv.includes('--force-abolish')
const SLEEP_MS = process.argv.includes('--sleep')
  ? Number(process.argv[process.argv.indexOf('--sleep') + 1])
  : 5000

const ABOLISH_AUTO_THRESHOLD = 5
const ABOLISH_HARD_LIMIT = 20
const API_BASE = 'https://www.jleague.jp/api/player/list/'
const UA = 'jleakstats.com/1.0 (+contact: jackcrispin13@gmail.com)'
const YEAR = SEASON
const MAX_PAGES = 300

const normalize = s => s ? s.normalize('NFKC').replace(/[\s　・]+/g, '').toLowerCase() : null

function parseDob(s) {
  if (!s) return null
  const m = s.trim().match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`
}

async function fetchPage(page) {
  const url = `${API_BASE}?page=${page}&year=${YEAR}`
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://www.jleague.jp/player/',
      'Accept': 'text/html, */*; q=0.01',
    },
  })
  if (res.status === 429 || res.status === 503) {
    throw new Error(`HALT: HTTP ${res.status}`)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.text()
}

function parsePlayers(html) {
  const $ = load(html)
  const players = []
  $('tr.clickable').each((_, tr) => {
    const $tr = $(tr)
    const dh = $tr.attr('data-href') || ''
    const m = dh.match(/\/player\/(\d+)\//)
    if (!m) return
    const tds = $tr.find('td').map((_, td) => $(td).text().replace(/\s+/g, ' ').trim()).get()
    if (tds.length < 12) return
    // td: [season, team, number, img, hg, name, position, birth_place, birth_date, height/weight, games, goals]
    players.push({
      jl7: m[1],
      teamShort: tds[1],
      number: tds[2] || null,
      name: tds[5],
      position: tds[6] || null,
      birthDate: parseDob(tds[8]),
    })
  })
  return players
}

async function fetchAllActive() {
  const all = []
  let page = 0
  while (page < MAX_PAGES) {
    const html = await fetchPage(page)
    const players = parsePlayers(html)
    if (players.length === 0) break
    all.push(...players)
    console.error(`  page=${page} -> ${players.length} (cumulative ${all.length})`)
    if (players.length < 10) break // partial last page
    page++
    if (page < MAX_PAGES) await sleep(SLEEP_MS)
  }
  return all
}

console.error(`\n=== Weekly jleague.jp API Sync ${DRY_RUN ? '(DRY-RUN)' : '(APPLY)'} | sleep=${SLEEP_MS}ms ===`)

const players = await fetchAllActive()
console.error(`  API 取得: ${players.length}人`)

if (players.length < 1000) {
  console.error(`✗ 取得件数が少なすぎる (${players.length}人 < 1000)。中止。`)
  console.log(JSON.stringify({
    summary: { aborted: true, reason: 'too_few_players', count: players.length },
  }, null, 2))
  process.exit(2)
}

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

const pmRows = await sql`SELECT id, name_ja, dob, team_id, no, is_active, canonical_id FROM players_master`
const playerById = new Map(pmRows.map(r => [r.id, r]))

const jpExtRows = await sql`SELECT canonical_id, external_id FROM player_external_ids WHERE source='j-league-jp'`
const canonicalByJpId = new Map(jpExtRows.map(r => [r.external_id, r.canonical_id]))

const NEW_CANONICAL_ID_START = 10_000_000
const maxIdRow = await sql`SELECT COALESCE(MAX(id), ${NEW_CANONICAL_ID_START - 1}) AS m FROM players_master WHERE id >= ${NEW_CANONICAL_ID_START}`
let nextCanonicalId = Number(maxIdRow[0].m) + 1

const ops = {
  newCanonicals: [], newJpLinks: [], newAliases: [],
  activations: [], transfers: [], abolishCandidates: [], errors: [],
}
const apiCanonicals = new Set()
const toCanonical = (id) => playerById.get(id)?.canonical_id ?? id

for (const p of players) {
  if (!p.jl7 || !p.name || !p.teamShort) { ops.errors.push({ player: p, reason: '必須項目空' }); continue }
  const teamId = teamByNormName.get(normalize(p.teamShort))
  if (!teamId) { ops.errors.push({ player: p, reason: `team未解決: ${p.teamShort}` }); continue }

  let canonicalId = canonicalByJpId.get(p.jl7)
  if (!canonicalId) {
    const norm = normalize(p.name)
    const aliasMatches = [...(canonicalsByNorm.get(norm) ?? [])]
    const candidateCanonicals = [...new Set(aliasMatches.map(toCanonical))]
    const teamMatched = candidateCanonicals.filter(c =>
      aliasMatches.some(aid => {
        const pm = playerById.get(aid)
        return pm && toCanonical(aid) === c && pm.team_id === teamId
      }) || (playerById.get(c)?.team_id === teamId)
    )

    if (teamMatched.length === 1) canonicalId = teamMatched[0]
    else if (teamMatched.length > 1 && p.birthDate) {
      const dobMatched = teamMatched.filter(c => {
        const pm = playerById.get(c)
        if (!pm?.dob) return false
        return new Date(pm.dob.getTime() + 9*3600*1000).toISOString().slice(0,10) === p.birthDate
      })
      if (dobMatched.length === 1) canonicalId = dobMatched[0]
    } else if (candidateCanonicals.length === 1) canonicalId = candidateCanonicals[0]
    else if (candidateCanonicals.length > 1 && p.birthDate) {
      const dobMatched = candidateCanonicals.filter(c => {
        const pm = playerById.get(c)
        if (!pm?.dob) return false
        return new Date(pm.dob.getTime() + 9*3600*1000).toISOString().slice(0,10) === p.birthDate
      })
      if (dobMatched.length === 1) canonicalId = dobMatched[0]
    }

    if (!canonicalId) {
      canonicalId = nextCanonicalId++
      ops.newCanonicals.push({ id: canonicalId, name_ja: p.name, team_id: teamId, no: p.number ? Number(p.number) : null, dob: p.birthDate })
    }
  }

  apiCanonicals.add(canonicalId)

  if (!canonicalByJpId.has(p.jl7)) {
    ops.newJpLinks.push({ canonical_id: canonicalId, jleague_id: p.jl7 })
  }
  const norm = normalize(p.name)
  if (norm) ops.newAliases.push({ canonical_id: canonicalId, name_ja: p.name, normalized: norm })

  const pm = playerById.get(canonicalId)
  const noParsed = p.number ? parseInt(p.number, 10) : null
  const no = Number.isFinite(noParsed) ? noParsed : null
  if (pm) {
    if (!pm.is_active) {
      ops.activations.push({ id: canonicalId, name_ja: pm.name_ja, team_id: teamId, no, dob: p.birthDate, prev: 'inactive' })
    } else if (pm.team_id !== teamId) {
      ops.transfers.push({ id: canonicalId, name_ja: pm.name_ja, from_team_id: pm.team_id, to_team_id: teamId, no })
    } else if (pm.no !== no && no !== null) {
      ops.activations.push({ id: canonicalId, name_ja: pm.name_ja, team_id: teamId, no, dob: p.birthDate, prev: 'no_change' })
    }
  }
}

const currentActive = pmRows.filter(p => p.is_active && (p.canonical_id == null || p.canonical_id === p.id))
for (const p of currentActive) {
  if (!apiCanonicals.has(p.id)) {
    ops.abolishCandidates.push({ id: p.id, name_ja: p.name_ja, team_id: p.team_id })
  }
}

console.error('\n  操作プラン:')
console.error(`    新規 canonical    : ${ops.newCanonicals.length}件`)
console.error(`    新規 7桁ID紐付け  : ${ops.newJpLinks.length}件`)
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
  source: 'jleague.jp/api/player/list',
  fetched: players.length,
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

// ─── APPLY ──────────────────────────────────────
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
    VALUES (${a.canonical_id}, ${a.name_ja}, ${a.normalized}, 'jleague-api-weekly')
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
  VALUES ('weekly_sync_jleague_api', ${JSON.stringify(summary)}::jsonb, 'cron')
`)

if (queries.length > 0) {
  await sql.transaction(queries)
  console.error(`  ✓ COMMIT (${queries.length} queries)`)
}

console.log(JSON.stringify({ summary, ...ops }, null, 2))
