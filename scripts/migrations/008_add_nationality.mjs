// player_overseas_status に nationality カラムを追加し、
// 既存行を tmp/overseas_discover_2025.json (API-Football cache) から backfill する。
//
// 用途: 結果ページで「日本人選手だけ」フィルタを実装するため。
// 元 J 外国人 (フッキ, カイオ, ポドルスキ等) と日本人を確実に判別したい。
//
// 実行:
//   node --env-file=.env.local scripts/migrations/008_add_nationality.mjs

import fs from 'node:fs'
import { Pool } from '@neondatabase/serverless'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

console.log('1. ALTER TABLE: nationality カラム追加 (IF NOT EXISTS)...')
await pool.query(`
  ALTER TABLE player_overseas_status
  ADD COLUMN IF NOT EXISTS nationality TEXT
`)

console.log('2. cache 読込...')
const cache = JSON.parse(
  fs.readFileSync('tmp/overseas_discover_2025.json', 'utf-8'),
)
// api_football_id → nationality マップ
const byApiId = new Map()
for (const d of cache.discovered ?? []) {
  const id = d.apiPlayer?.id
  const nat = d.apiPlayer?.nationality
  if (id && nat) byApiId.set(id, nat)
}
console.log(`   cache: ${byApiId.size} 件の api_football_id → nationality`)

console.log('3. backfill 実行...')
const rows = (await pool.query(`
  SELECT canonical_id, api_football_id FROM player_overseas_status
  WHERE nationality IS NULL
`)).rows
console.log(`   対象 (nationality NULL): ${rows.length} 件`)

let updated = 0
let missing = 0
for (const r of rows) {
  const nat = byApiId.get(r.api_football_id)
  if (!nat) {
    missing += 1
    continue
  }
  await pool.query(
    `UPDATE player_overseas_status SET nationality = $1 WHERE canonical_id = $2`,
    [nat, r.canonical_id],
  )
  updated += 1
}

console.log(`\n✅ updated: ${updated}`)
console.log(`⚠️  missing in cache: ${missing}`)

console.log('\n4. 集計確認:')
const stats = (await pool.query(`
  SELECT
    COUNT(*) FILTER (WHERE nationality = 'Japan')::int AS japanese,
    COUNT(*) FILTER (WHERE nationality IS NOT NULL AND nationality <> 'Japan')::int AS foreign_,
    COUNT(*) FILTER (WHERE nationality IS NULL)::int AS unknown,
    COUNT(*)::int AS total
  FROM player_overseas_status
`)).rows[0]
console.table(stats)

await pool.end()
