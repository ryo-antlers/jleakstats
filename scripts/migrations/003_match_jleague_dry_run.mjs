// Phase 2 / Step 2: SFIX03 と既存 players_master を突合 (DRY-RUN)
//
// やること:
//   - data/jleague-snapshot-YYYYMMDD.json を読み込み (Step 1の出力)
//   - 既存 players_master を全件取得
//   - 多段マッチング (J-League ID / name+dob / normalized name)
//   - 結果を5カテゴリに分類してレポート出力
//   - 詳細を data/match-preview-YYYYMMDD.csv に保存
//
// 重要: DB は SELECT のみ、INSERT/UPDATE 一切なし

import { Pool } from '@neondatabase/serverless'
import { readFileSync, writeFileSync, readdirSync } from 'fs'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// 最新 snapshot を探す
const snapshotFile = readdirSync('data')
  .filter(f => /^jleague-snapshot-\d{8}\.json$/.test(f))
  .sort()
  .pop()
if (!snapshotFile) {
  console.error('✗ data/jleague-snapshot-YYYYMMDD.json が見つかりません。先に Step 1 を実行してください')
  process.exit(1)
}
const TODAY = new Date().toISOString().slice(0, 10).replace(/-/g, '')
const OUT_CSV = `data/match-preview-${TODAY}.csv`

// 名前正規化 (Phase 1 と同ロジック)
const normalize = s => s ? s.normalize('NFKC').replace(/[\s　・]+/g, '').toLowerCase() : null

// DB の dob (Date object, JST 0時) → "YYYY-MM-DD" (JST 起点)
// 注: toISOString() は UTC 変換でズレるので、+9h してから ISO 化
function dobToJstString(d) {
  if (!d) return null
  if (typeof d === 'string') return d.slice(0, 10)
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// 2つの dob 文字列が一致するか (±1日まで許容)
// 既存DBの取り込み時に1日ズレたデータがあるため
function dobMatches(dbDob, sfixDob) {
  if (!dbDob || !sfixDob) return false
  if (dbDob === sfixDob) return { exact: true, near: false }
  // ±1日チェック
  const dbT = new Date(dbDob).getTime()
  const sfxT = new Date(sfixDob).getTime()
  const diff = Math.abs(dbT - sfxT)
  if (diff <= 24 * 60 * 60 * 1000) return { exact: false, near: true }
  return false
}

console.log(`\n=== Phase 2 Step 2: 突合 DRY-RUN ===\n`)
console.log(`SFIX03 snapshot: data/${snapshotFile}`)

// ─── ロード ───────────────────────────────────────
const snapshot = JSON.parse(readFileSync(`data/${snapshotFile}`, 'utf-8'))
const sfix = snapshot.players
console.log(`SFIX03 件数: ${sfix.length}`)

// SFIX03 を name(normalized) → [{...}] のマップに
// primary + aliases 両方を検索キーとして登録
const sfixByNorm = new Map()
for (const p of sfix) {
  const keys = new Set([p.name_ja, ...p.aliases].map(normalize).filter(Boolean))
  for (const k of keys) {
    if (!sfixByNorm.has(k)) sfixByNorm.set(k, [])
    sfixByNorm.get(k).push(p)
  }
}

// J-League ID → SFIX03 行のマップ
const sfixById = new Map(sfix.map(p => [p.jleague_id, p]))

// ─── 既存 players_master 取得 ──────────────────────
const dbRows = (await pool.query(`
  SELECT pm.id, pm.name_ja, pm.name_en, pm.name_kana, pm.dob, pm.team_id, pm.position,
         pm.canonical_id, pm.is_active,
         t.name_ja AS team_name, t.short_name AS team_short,
         (SELECT external_id FROM player_external_ids
          WHERE canonical_id = COALESCE(pm.canonical_id, pm.id) AND source='j-league' LIMIT 1) AS existing_jleague_id
  FROM players_master pm
  LEFT JOIN teams_master t ON t.id = pm.team_id
`)).rows
console.log(`DB players_master 件数: ${dbRows.length}\n`)

// ─── マッチング ────────────────────────────────────
// dbRow に対して SFIX03 候補を探す
//   ① 既に j-league external_id 紐付け済 → 確定
//   ② name(normalized) + dob 完全一致 → 確定 (high confidence)
//   ③ name(normalized) のみ一致 (1件) → 確定 (medium confidence)
//   ④ name(normalized) のみ一致 (複数) → 曖昧 (要review)
//   ⑤ どれもヒットせず → DB only

const results = {
  alreadyLinked: [],     // ①
  matchedByNameDob: [],  // ② name + dob 完全一致
  matchedByNameDobNear: [], // ②' name + dob ±1日 (DB取り込みズレ吸収)
  matchedByName: [],     // ③
  ambiguous: [],         // ④
  dbOnly: [],            // ⑤
}

const matchedSfixIds = new Set()

for (const db of dbRows) {
  // ① 既に紐付け済
  if (db.existing_jleague_id) {
    const sfixRow = sfixById.get(db.existing_jleague_id)
    if (sfixRow) {
      results.alreadyLinked.push({ db, sfix: sfixRow })
      matchedSfixIds.add(sfixRow.jleague_id)
      continue
    }
  }

  const norm = normalize(db.name_ja)
  const candidates = sfixByNorm.get(norm) ?? []

  if (candidates.length === 0) {
    results.dbOnly.push(db)
    continue
  }

  // ② name + dob 完全一致 (またはニアミス±1日)
  const dbDobJst = dobToJstString(db.dob)
  const exactMatched = []
  const nearMatched = []
  for (const c of candidates) {
    const m = dobMatches(dbDobJst, c.dob)
    if (m && m.exact) exactMatched.push(c)
    else if (m && m.near) nearMatched.push(c)
  }
  if (exactMatched.length === 1) {
    results.matchedByNameDob.push({ db, sfix: exactMatched[0] })
    matchedSfixIds.add(exactMatched[0].jleague_id)
    continue
  }
  if (exactMatched.length === 0 && nearMatched.length === 1) {
    results.matchedByNameDobNear.push({ db, sfix: nearMatched[0], db_dob: dbDobJst })
    matchedSfixIds.add(nearMatched[0].jleague_id)
    continue
  }
  if (exactMatched.length > 1 || nearMatched.length > 1) {
    results.ambiguous.push({ db, candidates: [...exactMatched, ...nearMatched], reason: 'name+dob both match multiple' })
    continue
  }

  // ③ name のみ一致 (1件)
  if (candidates.length === 1) {
    // dob 無し or 不一致の場合
    results.matchedByName.push({ db, sfix: candidates[0], dob_match: false })
    matchedSfixIds.add(candidates[0].jleague_id)
    continue
  }

  // ④ name 複数一致 → team や position で絞り込み
  const teamMatched = candidates.filter(c => normalize(c.last_team) === normalize(db.team_short ?? db.team_name))
  if (teamMatched.length === 1) {
    results.matchedByName.push({ db, sfix: teamMatched[0], dob_match: false, team_match: true })
    matchedSfixIds.add(teamMatched[0].jleague_id)
    continue
  }

  results.ambiguous.push({ db, candidates, reason: `name match ${candidates.length} candidates, no team narrow-down` })
}

// SFIX03 のうち、まだ DB に居ない選手 (新規候補)
const sfixOnly = sfix.filter(p => !matchedSfixIds.has(p.jleague_id))

// ─── サマリ表示 ────────────────────────────────────
console.log('=== マッチング結果サマリ ===\n')
console.table([
  { category: '① 既紐付け済', count: results.alreadyLinked.length },
  { category: '② name+dob 完全一致', count: results.matchedByNameDob.length },
  { category: "②' name+dob ±1日 (DB取込ズレ)", count: results.matchedByNameDobNear.length },
  { category: '③ name のみ一致 (1件 or team絞込)', count: results.matchedByName.length },
  { category: '④ 曖昧 (複数候補)', count: results.ambiguous.length },
  { category: '⑤ DB のみ (SFIX03に無い)', count: results.dbOnly.length },
  { category: '🆕 SFIX03 のみ (新規canonical候補)', count: sfixOnly.length },
])

const totalMatched = results.alreadyLinked.length + results.matchedByNameDob.length + results.matchedByNameDobNear.length + results.matchedByName.length
console.log(`\nDB ${dbRows.length}件中、 ${totalMatched} 件マッチ (${(totalMatched/dbRows.length*100).toFixed(1)}%)`)
console.log(`SFIX03 ${sfix.length}件中、 ${matchedSfixIds.size} 件マッチ (${(matchedSfixIds.size/sfix.length*100).toFixed(1)}%)`)

// ─── 詳細サンプル ──────────────────────────────────
console.log('\n④ 曖昧サンプル (5件):')
console.table(results.ambiguous.slice(0, 5).map(a => ({
  db_id: a.db.id,
  db_name: a.db.name_ja,
  db_team: a.db.team_short,
  db_dob: a.db.dob ? new Date(a.db.dob).toISOString().slice(0,10) : null,
  candidates: a.candidates.length,
  reason: a.reason,
})))

console.log('\n⑤ DB のみ サンプル (10件):')
console.table(results.dbOnly.slice(0, 10).map(d => ({
  id: d.id, name: d.name_ja, team: d.team_short, position: d.position,
  is_active: d.is_active, has_dob: !!d.dob,
})))

console.log('\n🆕 SFIX03 のみ (= 新規canonical候補) サンプル (10件):')
console.table(sfixOnly.slice(0, 10).map(s => ({
  jleague_id: s.jleague_id, name: s.name_ja, last_team: s.last_team, position: s.position, dob: s.dob,
})))

// ─── CSV 出力 (Excel で確認用) ─────────────────────
const csvRows = []
csvRows.push(['category', 'db_id', 'db_name', 'db_team', 'db_dob', 'sfix_jleague_id', 'sfix_name', 'sfix_team', 'sfix_dob', 'note'])

for (const r of results.alreadyLinked) {
  csvRows.push(['already-linked', r.db.id, r.db.name_ja, r.db.team_short ?? '', r.db.dob ?? '', r.sfix.jleague_id, r.sfix.name_ja, r.sfix.last_team ?? '', r.sfix.dob ?? '', ''])
}
for (const r of results.matchedByNameDob) {
  csvRows.push(['confident', r.db.id, r.db.name_ja, r.db.team_short ?? '', dobToJstString(r.db.dob) ?? '', r.sfix.jleague_id, r.sfix.name_ja, r.sfix.last_team ?? '', r.sfix.dob ?? '', 'name+dob exact'])
}
for (const r of results.matchedByNameDobNear) {
  csvRows.push(['near-dob', r.db.id, r.db.name_ja, r.db.team_short ?? '', r.db_dob ?? '', r.sfix.jleague_id, r.sfix.name_ja, r.sfix.last_team ?? '', r.sfix.dob ?? '', 'name+dob ±1日 (DB取込ズレ)'])
}
for (const r of results.matchedByName) {
  csvRows.push(['name-only', r.db.id, r.db.name_ja, r.db.team_short ?? '', r.db.dob ?? '', r.sfix.jleague_id, r.sfix.name_ja, r.sfix.last_team ?? '', r.sfix.dob ?? '', r.team_match ? 'team narrow-down' : 'single name match'])
}
for (const r of results.ambiguous) {
  for (const c of r.candidates) {
    csvRows.push(['ambiguous', r.db.id, r.db.name_ja, r.db.team_short ?? '', r.db.dob ?? '', c.jleague_id, c.name_ja, c.last_team ?? '', c.dob ?? '', r.reason])
  }
}
for (const d of results.dbOnly) {
  csvRows.push(['db-only', d.id, d.name_ja, d.team_short ?? '', d.dob ?? '', '', '', '', '', `pos=${d.position} active=${d.is_active}`])
}
for (const s of sfixOnly) {
  csvRows.push(['sfix-only', '', '', '', '', s.jleague_id, s.name_ja, s.last_team ?? '', s.dob ?? '', `pos=${s.position}`])
}

// CSV escape
const esc = v => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
writeFileSync(OUT_CSV, csvRows.map(row => row.map(esc).join(',')).join('\n'), 'utf-8')

console.log(`\n✅ 詳細レポート: ${OUT_CSV} (${csvRows.length - 1}行)`)
console.log(`\n次: Step 3 (本適用) ※ 上記サマリと CSV を確認してから`)

await pool.end()
