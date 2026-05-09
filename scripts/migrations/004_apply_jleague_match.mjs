// Phase 2 / Step 3: SFIX03 → DB 反映 (DRY-RUN / APPLY 切替)
//
// やること:
//   1. SFIX03 全 9133人を DB に取り込み
//   2. 既存 players_master とマッチした分は J-League ID を player_external_ids に紐付け
//   3. 新規 SFIX03 専用 canonical を 10,000,000+ レンジで採番
//   4. SFIX03 由来の primary名 + 別表記を player_aliases に登録
//   5. 既存 players_master の dob / name_en / size を SFIX03 から補完 (NULLのみ)
//   6. 同一 J-League ID に複数 DB 行がマッチした場合は自動 canonical merge
//   7. 全操作を canonical_audit_log に記録
//   8. 全部 1 トランザクションで実行 (失敗時は完全 rollback)
//
// やらないこと:
//   - ④ ambiguous 44件は触らず保留
//   - ⑤ DB only 243件 (異体字組) は触らず保留
//   - is_active フラグは触らない (Step 4 でユーザースプレッドシートから更新)
//   - 既存 dob/name_ja/team_id などの値の上書き (補完のみ)
//
// 実行:
//   node --env-file=.env.local scripts/migrations/004_apply_jleague_match.mjs            # DRY-RUN (デフォルト)
//   node --env-file=.env.local scripts/migrations/004_apply_jleague_match.mjs --apply    # 本実行

import { Pool } from '@neondatabase/serverless'
import { readFileSync, readdirSync } from 'fs'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const APPLY = process.argv.includes('--apply')
const MODE = APPLY ? 'APPLY' : 'DRY-RUN'

// 新規 canonical のID開始位置 (10M+ = SFIX03-imported を示す)
const NEW_CANONICAL_ID_START = 10_000_000

// ─── ロード ───────────────────────────────────────
const snapshotFile = readdirSync('data')
  .filter(f => /^jleague-snapshot-\d{8}\.json$/.test(f))
  .sort().pop()
const snapshot = JSON.parse(readFileSync(`data/${snapshotFile}`, 'utf-8'))
const sfix = snapshot.players

const normalize = s => s ? s.normalize('NFKC').replace(/[\s　・]+/g, '').toLowerCase() : null
function dobToJstString(d) {
  if (!d) return null
  if (typeof d === 'string') return d.slice(0, 10)
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// SFIX03: name(normalized) → [{...}]
const sfixByNorm = new Map()
for (const p of sfix) {
  const keys = new Set([p.name_ja, ...p.aliases].map(normalize).filter(Boolean))
  for (const k of keys) {
    if (!sfixByNorm.has(k)) sfixByNorm.set(k, [])
    sfixByNorm.get(k).push(p)
  }
}
const sfixById = new Map(sfix.map(p => [p.jleague_id, p]))

console.log(`\n=== Phase 2 Step 3: ${MODE} ===\n`)
console.log(`SFIX03 snapshot: data/${snapshotFile} (${sfix.length}人)`)

// ─── DB 取得 ──────────────────────────────────────
const dbRows = (await pool.query(`
  SELECT pm.id, pm.name_ja, pm.name_en, pm.dob, pm.size, pm.team_id, pm.position,
         pm.canonical_id, pm.is_active,
         t.short_name AS team_short, t.name_ja AS team_name,
         (SELECT external_id FROM player_external_ids
          WHERE canonical_id = COALESCE(pm.canonical_id, pm.id) AND source='j-league' LIMIT 1) AS existing_jleague_id
  FROM players_master pm
  LEFT JOIN teams_master t ON t.id = pm.team_id
`)).rows

// チーム名 → team_id マップ (新規 canonical の team_id 解決用)
const teamRows = (await pool.query(`SELECT id, name_ja, short_name, abbr FROM teams_master`)).rows
const teamByShort = new Map(teamRows.map(t => [t.short_name, t.id]))
const teamByName = new Map(teamRows.map(t => [t.name_ja, t.id]))

console.log(`DB players_master: ${dbRows.length}件`)
console.log(`teams_master: ${teamRows.length}件\n`)

// ─── マッチング (Step 2 と同じロジック) ────────────
const jleagueToCanonicals = new Map()  // sfix.jleague_id → [canonical_id, ...] (複数ヒット検出用)
const matchedDbRows = []   // {db, sfix} 確定マッチ
const ambiguousDbRows = []
const dbOnlyRows = []

for (const db of dbRows) {
  if (db.existing_jleague_id) {
    matchedDbRows.push({ db, sfix: sfixById.get(db.existing_jleague_id), reason: 'already-linked' })
    continue
  }
  const norm = normalize(db.name_ja)
  const candidates = sfixByNorm.get(norm) ?? []
  if (candidates.length === 0) { dbOnlyRows.push(db); continue }

  const dbDobJst = dobToJstString(db.dob)
  const exact = []
  const near = []
  for (const c of candidates) {
    if (!dbDobJst || !c.dob) continue
    const dbT = new Date(dbDobJst).getTime()
    const cT = new Date(c.dob).getTime()
    const diff = Math.abs(dbT - cT)
    if (dbDobJst === c.dob) exact.push(c)
    else if (diff <= 24*60*60*1000) near.push(c)
  }
  if (exact.length === 1) { matchedDbRows.push({ db, sfix: exact[0], reason: 'name+dob exact' }); continue }
  if (exact.length === 0 && near.length === 1) { matchedDbRows.push({ db, sfix: near[0], reason: 'name+dob ±1日' }); continue }
  if (exact.length > 1 || near.length > 1) { ambiguousDbRows.push({ db, candidates: [...exact, ...near] }); continue }

  if (candidates.length === 1) { matchedDbRows.push({ db, sfix: candidates[0], reason: 'name only (1候補)' }); continue }
  const teamMatched = candidates.filter(c => normalize(c.last_team) === normalize(db.team_short ?? db.team_name))
  if (teamMatched.length === 1) { matchedDbRows.push({ db, sfix: teamMatched[0], reason: 'name+team narrow-down' }); continue }

  ambiguousDbRows.push({ db, candidates, reason: 'multiple, no narrow-down' })
}

// ─── 操作プラン構築 ───────────────────────────────

// 1) external_ids INSERT (canonical_id, jleague_id) — マッチした分
//    jleagueToCanonicals に集めて、複数 DB 行が同じ jleague_id にマッチしたら auto-merge
for (const m of matchedDbRows) {
  if (!m.sfix) continue
  const canonical = m.db.canonical_id ?? m.db.id
  if (!jleagueToCanonicals.has(m.sfix.jleague_id)) {
    jleagueToCanonicals.set(m.sfix.jleague_id, new Set())
  }
  jleagueToCanonicals.get(m.sfix.jleague_id).add(canonical)
}

// auto-merge プラン (同じ jleague_id に複数 canonical がマッチ)
const autoMerges = []
for (const [jId, canonicals] of jleagueToCanonicals.entries()) {
  if (canonicals.size > 1) {
    const arr = [...canonicals]
    // 「勝者」決定: API-Football ID 持ち (id < 9M) を優先、無ければ最小 ID
    const apiFb = arr.filter(c => c > 0 && c < 9_000_000)
    const winner = apiFb.length > 0 ? Math.min(...apiFb) : Math.min(...arr)
    const losers = arr.filter(c => c !== winner)
    autoMerges.push({ jleague_id: jId, winner, losers })
  }
}

// 2) external_ids INSERT (1 jleague_id → 1 canonical, auto-merge後の winner)
const externalIdInserts = []
for (const [jId, canonicals] of jleagueToCanonicals.entries()) {
  const merge = autoMerges.find(a => a.jleague_id === jId)
  const target = merge ? merge.winner : [...canonicals][0]
  externalIdInserts.push({ canonical_id: target, jleague_id: jId })
}

// 3) aliases INSERT — SFIX03 の primary名 + 別表記すべて
const aliasInserts = []
for (const m of matchedDbRows) {
  if (!m.sfix) continue
  const canonical = m.db.canonical_id ?? m.db.id
  const merge = autoMerges.find(a => a.jleague_id === m.sfix.jleague_id)
  const target = merge ? merge.winner : canonical
  for (const name of [m.sfix.name_ja, ...m.sfix.aliases]) {
    const norm = normalize(name)
    if (!norm) continue
    aliasInserts.push({ canonical_id: target, name_ja: name, normalized: norm, source: 'sfix03' })
  }
}

// 4) players_master UPDATE — dob/name_en/size 補完 (NULL のみ)
const updates = []
for (const m of matchedDbRows) {
  if (!m.sfix) continue
  const u = { id: m.db.id }
  if (!m.db.dob && m.sfix.dob) u.dob = m.sfix.dob
  if (!m.db.name_en && m.sfix.name_en) u.name_en = m.sfix.name_en
  if (!m.db.size && (m.sfix.height_cm || m.sfix.weight_kg)) {
    u.size = `${m.sfix.height_cm ?? ''}/${m.sfix.weight_kg ?? ''}`
  }
  if (Object.keys(u).length > 1) updates.push(u)
}

// 5) 新規 canonical INSERT — SFIX03 のみの選手 (auto-merge も考慮)
const sfixOnlyMatched = new Set([...jleagueToCanonicals.keys()])
const sfixOnly = sfix.filter(p => !sfixOnlyMatched.has(p.jleague_id))

const newCanonicals = []
let nextId = NEW_CANONICAL_ID_START
for (const p of sfixOnly) {
  const teamId = teamByShort.get(p.last_team) ?? teamByName.get(p.last_team) ?? null
  newCanonicals.push({
    id: nextId++,
    jleague_id: p.jleague_id,
    name_ja: p.name_ja,
    name_en: p.name_en,
    dob: p.dob,
    position: p.position,
    team_id: teamId,
    size: (p.height_cm || p.weight_kg) ? `${p.height_cm ?? ''}/${p.weight_kg ?? ''}` : null,
    aliases: p.aliases,
  })
}

// 6) auto-merge UPDATE — 既存 canonical_id を winner に書き換え
//    fixture_lineups などの player_id は触らない (canonical_id ポインタで集計時に解決)
const canonicalMergeUpdates = []
for (const m of autoMerges) {
  for (const loser of m.losers) {
    canonicalMergeUpdates.push({ id: loser, canonical_id: m.winner, jleague_id: m.jleague_id })
  }
}

// ─── サマリ表示 ────────────────────────────────────
console.log('=== 操作プラン ===\n')
console.table([
  { op: 'マッチ件数 (DB→SFIX03)', count: matchedDbRows.length },
  { op: '└ うち auto-merge 対象', count: canonicalMergeUpdates.length },
  { op: 'ambiguous (保留)', count: ambiguousDbRows.length },
  { op: 'DB only (保留)', count: dbOnlyRows.length },
  { op: 'SFIX03 only (新規 canonical)', count: newCanonicals.length },
  { op: '──' , count: '──' },
  { op: 'INSERT player_external_ids', count: externalIdInserts.length },
  { op: 'INSERT player_aliases', count: aliasInserts.length },
  { op: 'UPDATE players_master (補完)', count: updates.length },
  { op: 'INSERT players_master (新規 canonical)', count: newCanonicals.length },
  { op: 'UPDATE players_master (auto-merge canonical_id)', count: canonicalMergeUpdates.length },
])

// auto-merge サンプル
if (autoMerges.length > 0) {
  console.log('\n=== auto-merge サンプル (10件) ===')
  console.table(autoMerges.slice(0, 10).map(m => ({
    jleague_id: m.jleague_id,
    winner: m.winner,
    losers: m.losers.join(', '),
    sfix_name: sfixById.get(m.jleague_id)?.name_ja,
  })))
}

// 新規 canonical サンプル
console.log('\n=== 新規 canonical サンプル (5件) ===')
console.table(newCanonicals.slice(0, 5).map(c => ({
  new_id: c.id,
  name_ja: c.name_ja,
  jleague_id: c.jleague_id,
  team_id: c.team_id ?? '不明',
  position: c.position,
})))

if (!APPLY) {
  console.log('\n--- DRY-RUN モード: DB変更なし ---')
  console.log(`本実行: node --env-file=.env.local scripts/migrations/004_apply_jleague_match.mjs --apply`)
  await pool.end()
  process.exit(0)
}

// ─── APPLY: 1 トランザクションで実行 ───────────────
console.log('\n=== APPLY 開始 (1 トランザクション) ===\n')
const client = await pool.connect()

try {
  await client.query('BEGIN')

  // (a) 新規 canonical INSERT
  console.log(`[a] INSERT players_master ${newCanonicals.length}件 ...`)
  for (let i = 0; i < newCanonicals.length; i += 200) {
    const batch = newCanonicals.slice(i, i + 200)
    const values = []
    const params = []
    for (const c of batch) {
      const off = params.length
      values.push(`($${off+1}, $${off+2}, $${off+3}, $${off+4}, $${off+5}, $${off+6}, $${off+7}, false, NOW())`)
      params.push(c.id, c.name_ja, c.name_en, c.position, c.dob, c.team_id, c.size)
    }
    await client.query(
      `INSERT INTO players_master (id, name_ja, name_en, position, dob, team_id, size, is_active, updated_at)
       VALUES ${values.join(',')}
       ON CONFLICT (id) DO NOTHING`,
      params
    )
  }
  console.log(`    ✓ ${newCanonicals.length}件`)

  // (b) auto-merge canonical_id UPDATE
  console.log(`[b] UPDATE players_master canonical_id (auto-merge) ${canonicalMergeUpdates.length}件 ...`)
  for (const u of canonicalMergeUpdates) {
    await client.query(
      `UPDATE players_master SET canonical_id = $1 WHERE id = $2 AND (canonical_id IS NULL OR canonical_id = id)`,
      [u.canonical_id, u.id]
    )
  }
  console.log(`    ✓ ${canonicalMergeUpdates.length}件`)

  // (c) external_ids INSERT
  console.log(`[c] INSERT player_external_ids ${externalIdInserts.length}件 ...`)
  // 新規 canonical 分 + マッチ分
  const allExtIds = [
    ...externalIdInserts,
    ...newCanonicals.map(c => ({ canonical_id: c.id, jleague_id: c.jleague_id })),
  ]
  for (let i = 0; i < allExtIds.length; i += 500) {
    const batch = allExtIds.slice(i, i + 500)
    const values = []
    const params = []
    for (const r of batch) {
      const off = params.length
      values.push(`($${off+1}, 'j-league', $${off+2})`)
      params.push(r.canonical_id, r.jleague_id)
    }
    await client.query(
      `INSERT INTO player_external_ids (canonical_id, source, external_id)
       VALUES ${values.join(',')}
       ON CONFLICT (source, external_id) DO NOTHING`,
      params
    )
  }
  console.log(`    ✓ ${allExtIds.length}件 (新規 canonical 分含む)`)

  // (d) aliases INSERT (マッチ分 + 新規 canonical 分)
  console.log(`[d] INSERT player_aliases ...`)
  const allAliases = [...aliasInserts]
  for (const c of newCanonicals) {
    for (const name of [c.name_ja, ...c.aliases]) {
      const norm = normalize(name)
      if (!norm) continue
      allAliases.push({ canonical_id: c.id, name_ja: name, normalized: norm, source: 'sfix03' })
    }
  }
  for (let i = 0; i < allAliases.length; i += 500) {
    const batch = allAliases.slice(i, i + 500)
    const values = []
    const params = []
    for (const a of batch) {
      const off = params.length
      values.push(`($${off+1}, $${off+2}, $${off+3}, $${off+4})`)
      params.push(a.canonical_id, a.name_ja, a.normalized, a.source)
    }
    await client.query(
      `INSERT INTO player_aliases (canonical_id, name_ja, normalized, source)
       VALUES ${values.join(',')}
       ON CONFLICT (canonical_id, normalized) DO NOTHING`,
      params
    )
  }
  console.log(`    ✓ ${allAliases.length}件 (重複は ON CONFLICT で skip)`)

  // (e) players_master UPDATE 補完
  console.log(`[e] UPDATE players_master 補完 ${updates.length}件 ...`)
  for (const u of updates) {
    const sets = []
    const params = []
    if (u.dob != null) { sets.push(`dob = $${params.length+1}`); params.push(u.dob) }
    if (u.name_en != null) { sets.push(`name_en = $${params.length+1}`); params.push(u.name_en) }
    if (u.size != null) { sets.push(`size = $${params.length+1}`); params.push(u.size) }
    if (sets.length === 0) continue
    params.push(u.id)
    await client.query(
      `UPDATE players_master SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
      params
    )
  }
  console.log(`    ✓ ${updates.length}件`)

  // (f) audit_log
  await client.query(
    `INSERT INTO canonical_audit_log (action, payload, actor) VALUES ('phase2_step3_apply', $1::jsonb, 'migration-script')`,
    [JSON.stringify({
      mode: MODE,
      sfix_total: sfix.length,
      matched: matchedDbRows.length,
      ambiguous_skipped: ambiguousDbRows.length,
      db_only_skipped: dbOnlyRows.length,
      new_canonicals: newCanonicals.length,
      auto_merges: autoMerges.length,
      external_id_inserts: allExtIds.length,
      alias_inserts: allAliases.length,
      updates: updates.length,
      ran_at: new Date().toISOString(),
    })]
  )
  // 各 auto-merge も個別記録
  for (const m of autoMerges) {
    await client.query(
      `INSERT INTO canonical_audit_log (action, canonical_id, target_id, payload, actor)
       VALUES ('auto_merge_via_jleague_id', $1, $2, $3::jsonb, 'migration-script')`,
      [m.winner, m.losers[0], JSON.stringify({ jleague_id: m.jleague_id, all_losers: m.losers })]
    )
  }
  console.log(`[f] canonical_audit_log INSERT 完了`)

  await client.query('COMMIT')
  console.log('\n✅ COMMIT 成功 — Phase 2 Step 3 完了\n')

} catch (err) {
  await client.query('ROLLBACK')
  console.error('\n✗ エラー発生 → ROLLBACK 完了 (DB は元の状態)')
  console.error(err)
  process.exit(1)
} finally {
  client.release()
}

// ─── 検証 ──────────────────────────────────────────
console.log('=== 事後検証 ===')
const verify = await pool.query(`
  SELECT
    (SELECT COUNT(*) FROM player_external_ids WHERE source='j-league') AS jleague_ext_ids,
    (SELECT COUNT(*) FROM player_external_ids WHERE source='api-football') AS apifb_ext_ids,
    (SELECT COUNT(*) FROM player_aliases WHERE source='sfix03') AS sfix03_aliases,
    (SELECT COUNT(*) FROM player_aliases) AS total_aliases,
    (SELECT COUNT(*) FROM players_master WHERE id >= 10000000) AS new_canonicals,
    (SELECT COUNT(*) FROM players_master) AS total_players,
    (SELECT COUNT(*) FROM players_master WHERE canonical_id IS NOT NULL AND canonical_id <> id) AS merged_rows
`)
console.table(verify.rows[0])

await pool.end()
