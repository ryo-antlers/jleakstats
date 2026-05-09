// Phase 0: 選手管理リファクタ着手前のスナップショット作成
// 対象テーブルを *_snapshot_20260509 として複製する
// 既存テーブルには一切触れない (純粋に追加のみ)

import { Pool } from '@neondatabase/serverless'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const SNAPSHOT_SUFFIX = 'snapshot_20260509'

// 選手IDが絡むテーブル一覧
const TABLES = [
  'players_master',
  'fixture_lineups',
  'fixture_player_stats',
  'fixture_events',
  'ratings',
  'fantasy_squads',
  'fantasy_starters',
  'fantasy_points',
  'fantasy_gw_starters',
  'fantasy_gw_player_prices',
  'player_season_stats',
]

console.log(`\n=== Phase 0: スナップショット作成 (suffix: _${SNAPSHOT_SUFFIX}) ===\n`)

const results = []
for (const table of TABLES) {
  const snapshotName = `${table}_${SNAPSHOT_SUFFIX}`

  // 元テーブル存在確認
  const existsRes = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1) AS exists`,
    [table]
  )
  if (!existsRes.rows[0].exists) {
    console.log(`⏭  ${table.padEnd(30)} → SKIP (テーブル存在しない)`)
    results.push({ table, status: 'skipped' })
    continue
  }

  // 既存スナップショットあれば二重実行防止
  const snapExistsRes = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1) AS exists`,
    [snapshotName]
  )
  if (snapExistsRes.rows[0].exists) {
    const cntRes = await pool.query(`SELECT COUNT(*)::int AS cnt FROM "${snapshotName}"`)
    const cnt = cntRes.rows[0].cnt
    console.log(`✓  ${table.padEnd(30)} → 既存 (${cnt} rows) スキップ`)
    results.push({ table, status: 'already-exists', rows: cnt })
    continue
  }

  // 元テーブルの行数
  const srcCntRes = await pool.query(`SELECT COUNT(*)::int AS cnt FROM "${table}"`)
  const srcCnt = srcCntRes.rows[0].cnt

  // スナップショット作成
  const t0 = Date.now()
  await pool.query(`CREATE TABLE "${snapshotName}" AS SELECT * FROM "${table}"`)
  const elapsed = Date.now() - t0

  // 検証: 行数一致
  const snapCntRes = await pool.query(`SELECT COUNT(*)::int AS cnt FROM "${snapshotName}"`)
  const snapCnt = snapCntRes.rows[0].cnt
  const ok = srcCnt === snapCnt
  const status = ok ? '✓ ' : '✗ '
  console.log(`${status} ${table.padEnd(30)} → ${snapshotName}  (${snapCnt}/${srcCnt} rows, ${elapsed}ms)`)
  results.push({ table, status: ok ? 'created' : 'mismatch', srcRows: srcCnt, snapRows: snapCnt })
}

console.log('\n=== サマリ ===')
console.table(results)

// DB 全体の容量確認
const sizeRes = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`)
console.log(`\nDB 総容量: ${sizeRes.rows[0].size}`)

console.log('\n✅ スナップショット完了')
console.log('   復元: TRUNCATE <table>; INSERT INTO <table> SELECT * FROM <table>_snapshot_20260509;')
console.log('   削除: DROP TABLE <table>_snapshot_20260509;')

await pool.end()
