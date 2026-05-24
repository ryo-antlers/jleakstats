// club_meta_overrides に access / away_travel / sightseeing カラムを追加。
//
// 用途:
//   access JSONB        — { station, walkMinutes, note }
//   away_travel JSONB   — { hours, yen, transport, note }   (= fromTokyo の値だけフラット保持)
//   sightseeing JSONB   — string[] (観光地名 6 件想定)
//
// 実行:
//   node --env-file=.env.local scripts/migrations/010_club_meta_extend.mjs

import { Pool } from '@neondatabase/serverless'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

console.log('ALTER TABLE club_meta_overrides (3 cols)...')
await pool.query(`
  ALTER TABLE club_meta_overrides
    ADD COLUMN IF NOT EXISTS access      JSONB,
    ADD COLUMN IF NOT EXISTS away_travel JSONB,
    ADD COLUMN IF NOT EXISTS sightseeing JSONB
`)

console.log('✅ done.')
await pool.end()
