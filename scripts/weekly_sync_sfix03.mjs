// 週次 SFIX03 同期: J-League SFIX03 から最新選手データを取得し、差分を反映
//
// 実行: node --env-file=.env.local scripts/weekly_sync_sfix03.mjs
//        node --env-file=.env.local scripts/weekly_sync_sfix03.mjs --dry-run
//
// 動作:
//   1. https://data.j-league.or.jp/SFIX03/search を1リクエストで取得
//   2. 既存 player_external_ids (source='j-league') と突合
//   3. 新規 SFIX03 エントリ → canonical 作成 or 既存 canonical に紐付け
//   4. 既存エントリ → alias 更新のみ (Idempotent)
//   5. 結果を JSON で stdout に出力 (GitHub Actions で email body 用)

import { Pool } from '@neondatabase/serverless'
import * as cheerio from 'cheerio'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const DRY_RUN = process.argv.includes('--dry-run')

const NEW_CANONICAL_ID_START = 10_000_000

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Accept-Language': 'ja',
}

const normalize = s => s ? s.normalize('NFKC').replace(/[\s　・]+/g, '').toLowerCase() : null

function parseNameWithAliases(name) {
  const m = name.match(/^(.+?)（(.+?)）\s*$/)
  if (!m) return { primary: name.trim(), aliases: [] }
  return { primary: m[1].trim(), aliases: m[2].split(/[、,]/).map(s => s.trim()).filter(Boolean) }
}
function parseDob(s) {
  if (!s) return null
  const m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}
function parseSize(s) {
  if (!s) return { height_cm: null, weight_kg: null }
  const m = s.match(/^(\d+)\s*\/\s*(\d+)$/)
  return m ? { height_cm: Number(m[1]), weight_kg: Number(m[2]) } : { height_cm: null, weight_kg: null }
}

console.error(`\n=== Weekly SFIX03 Sync ${DRY_RUN ? '(DRY-RUN)' : '(APPLY)'} ===`)

// ─── SFIX03 取得 ───────────────────────────────────
const t0 = Date.now()
const res = await fetch('https://data.j-league.or.jp/SFIX03/search', { headers: HEADERS })
if (!res.ok) {
  console.error(`✗ SFIX03 fetch failed: ${res.status}`)
  process.exit(1)
}
const html = await res.text()
const $ = cheerio.load(html)

const sfixPlayers = []
$('input[name="playerIdList"]').each((i, inp) => {
  const id = $(inp).attr('value')
  const tds = $(inp).closest('tr').find('td').map((_, td) => $(td).text().trim().replace(/\s+/g, ' ')).get()
  if (tds.length < 6) return
  const { primary, aliases } = parseNameWithAliases(tds[0])
  const size = parseSize(tds[5])
  sfixPlayers.push({
    jleague_id: id,
    name_ja: primary,
    aliases,
    name_en: tds[1] || null,
    last_team: tds[2] || null,
    position: tds[3] || null,
    dob: parseDob(tds[4]),
    height_cm: size.height_cm,
    weight_kg: size.weight_kg,
  })
})
console.error(`  ✓ SFIX03 取得: ${sfixPlayers.length}人 (${Date.now() - t0}ms)`)

// ─── 既存 DB 状態のロード ──────────────────────────
const existingExtIds = new Set(
  (await pool.query(`SELECT external_id FROM player_external_ids WHERE source='j-league'`))
    .rows.map(r => r.external_id)
)
console.error(`  ✓ 既存紐付け: ${existingExtIds.size}件`)

// 新規 SFIX03 (= 既存 ext_ids にない) のみ抽出
const newSfix = sfixPlayers.filter(p => !existingExtIds.has(p.jleague_id))
console.error(`  → 新規候補: ${newSfix.length}件`)

if (newSfix.length === 0) {
  console.error('\n変更なし。終了。')
  console.log(JSON.stringify({
    summary: { sfix_total: sfixPlayers.length, new_candidates: 0, new_canonicals: 0, new_links: 0 },
    new_canonicals: [],
    new_links: [],
  }, null, 2))
  await pool.end()
  process.exit(0)
}

// ─── マッチング ────────────────────────────────────
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
const pmRows = (await pool.query(`SELECT id, name_ja, dob, team_id, canonical_id FROM players_master`)).rows
const playerById = new Map(pmRows.map(r => [r.id, r]))

const maxId = Number((await pool.query(`SELECT COALESCE(MAX(id), ${NEW_CANONICAL_ID_START - 1}) AS m FROM players_master WHERE id >= ${NEW_CANONICAL_ID_START}`)).rows[0].m)
let nextCanonicalId = maxId + 1

const newCanonicals = []
const newLinks = []
const errors = []

for (const sp of newSfix) {
  const teamId = teamByNormName.get(normalize(sp.last_team)) ?? null
  const norm = normalize(sp.name_ja)

  // 候補 canonical 探索
  const aliasMatches = [...(canonicalsByNorm.get(norm) ?? [])]
  const toCanonical = (id) => playerById.get(id)?.canonical_id ?? id
  const candidateCanonicals = [...new Set(aliasMatches.map(toCanonical))]

  let canonicalId = null

  if (teamId && candidateCanonicals.length > 0) {
    // チーム一致で絞り込み
    const teamMatched = candidateCanonicals.filter(canonical =>
      aliasMatches.some(aid => {
        const pm = playerById.get(aid)
        return pm && toCanonical(aid) === canonical && pm.team_id === teamId
      }) || (playerById.get(canonical)?.team_id === teamId)
    )
    if (teamMatched.length === 1) {
      canonicalId = teamMatched[0]
    } else if (teamMatched.length > 1 && sp.dob) {
      const dobMatched = teamMatched.filter(c => {
        const pm = playerById.get(c)
        if (!pm?.dob) return false
        const pmDob = new Date(pm.dob.getTime() + 9*3600*1000).toISOString().slice(0,10)
        return pmDob === sp.dob
      })
      if (dobMatched.length === 1) canonicalId = dobMatched[0]
    }
  }

  if (!canonicalId && candidateCanonicals.length === 1) {
    // チーム不明だが name 単独一致 → 移籍/新規ユーザーの可能性
    canonicalId = candidateCanonicals[0]
  } else if (!canonicalId && candidateCanonicals.length > 1 && sp.dob) {
    // dob で絞り込み
    const dobMatched = candidateCanonicals.filter(c => {
      const pm = playerById.get(c)
      if (!pm?.dob) return false
      const pmDob = new Date(pm.dob.getTime() + 9*3600*1000).toISOString().slice(0,10)
      return pmDob === sp.dob
    })
    if (dobMatched.length === 1) canonicalId = dobMatched[0]
  }

  if (!canonicalId) {
    if (candidateCanonicals.length > 1) {
      errors.push({ jleague_id: sp.jleague_id, name: sp.name_ja, reason: `ambiguous (${candidateCanonicals.length}件), pending review` })
      continue
    }
    // 新規 canonical
    canonicalId = nextCanonicalId++
    newCanonicals.push({
      id: canonicalId,
      jleague_id: sp.jleague_id,
      name_ja: sp.name_ja,
      name_en: sp.name_en,
      dob: sp.dob,
      position: sp.position,
      team_id: teamId,
      size: (sp.height_cm || sp.weight_kg) ? `${sp.height_cm ?? ''}/${sp.weight_kg ?? ''}` : null,
      aliases: sp.aliases,
    })
  } else {
    newLinks.push({
      canonical_id: canonicalId,
      jleague_id: sp.jleague_id,
      name_ja: sp.name_ja,
      sfix_team: sp.last_team,
    })
  }
}

console.error(`  → 新規canonical: ${newCanonicals.length}件、 既存紐付け: ${newLinks.length}件、 エラー: ${errors.length}件`)

const summary = {
  ran_at: new Date().toISOString(),
  sfix_total: sfixPlayers.length,
  new_candidates: newSfix.length,
  new_canonicals: newCanonicals.length,
  new_links: newLinks.length,
  errors: errors.length,
}

if (DRY_RUN) {
  console.error('\n[DRY-RUN] DB変更なし')
  console.log(JSON.stringify({ summary, new_canonicals: newCanonicals, new_links: newLinks, errors }, null, 2))
  await pool.end()
  process.exit(0)
}

// ─── APPLY ────────────────────────────────────────
const client = await pool.connect()
try {
  await client.query('BEGIN')

  // (a) 新規 canonical INSERT
  for (let i = 0; i < newCanonicals.length; i += 200) {
    const batch = newCanonicals.slice(i, i + 200)
    const values = []; const params = []
    for (const c of batch) {
      const off = params.length
      values.push(`($${off+1}, $${off+2}, $${off+3}, $${off+4}, $${off+5}, $${off+6}, $${off+7}, false, NOW())`)
      params.push(c.id, c.name_ja, c.name_en, c.position, c.dob, c.team_id, c.size)
    }
    await client.query(
      `INSERT INTO players_master (id, name_ja, name_en, position, dob, team_id, size, is_active, updated_at)
       VALUES ${values.join(',')} ON CONFLICT (id) DO NOTHING`,
      params
    )
  }

  // (b) external_ids
  const allExtInserts = [
    ...newLinks.map(r => ({ canonical_id: r.canonical_id, jleague_id: r.jleague_id })),
    ...newCanonicals.map(c => ({ canonical_id: c.id, jleague_id: c.jleague_id })),
  ]
  for (let i = 0; i < allExtInserts.length; i += 500) {
    const batch = allExtInserts.slice(i, i + 500)
    const values = []; const params = []
    for (const r of batch) {
      const off = params.length
      values.push(`($${off+1}, 'j-league', $${off+2})`)
      params.push(r.canonical_id, r.jleague_id)
    }
    await client.query(
      `INSERT INTO player_external_ids (canonical_id, source, external_id) VALUES ${values.join(',')}
       ON CONFLICT (source, external_id) DO NOTHING`, params
    )
  }

  // (c) aliases
  const allAliases = []
  for (const c of newCanonicals) {
    for (const name of [c.name_ja, ...c.aliases]) {
      const norm = normalize(name)
      if (norm) allAliases.push({ canonical_id: c.id, name_ja: name, normalized: norm })
    }
  }
  for (const r of newLinks) {
    const norm = normalize(r.name_ja)
    if (norm) allAliases.push({ canonical_id: r.canonical_id, name_ja: r.name_ja, normalized: norm })
  }
  for (let i = 0; i < allAliases.length; i += 500) {
    const batch = allAliases.slice(i, i + 500)
    const values = []; const params = []
    for (const a of batch) {
      const off = params.length
      values.push(`($${off+1}, $${off+2}, $${off+3}, 'sfix03-weekly')`)
      params.push(a.canonical_id, a.name_ja, a.normalized)
    }
    if (values.length === 0) continue
    await client.query(
      `INSERT INTO player_aliases (canonical_id, name_ja, normalized, source) VALUES ${values.join(',')}
       ON CONFLICT (canonical_id, normalized) DO NOTHING`, params
    )
  }

  // (d) audit log
  await client.query(
    `INSERT INTO canonical_audit_log (action, payload, actor) VALUES ('weekly_sync_sfix03', $1::jsonb, 'cron')`,
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

console.log(JSON.stringify({ summary, new_canonicals: newCanonicals, new_links: newLinks, errors }, null, 2))
await pool.end()
