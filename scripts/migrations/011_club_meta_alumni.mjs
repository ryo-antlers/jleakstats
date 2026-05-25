// club_meta_overrides に notable_alumni JSONB を追加。
// 「主なOB選手」を admin から編集できるようにする。
//
// 実行:
//   node --env-file=.env.local scripts/migrations/011_club_meta_alumni.mjs

import { Pool } from '@neondatabase/serverless'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

console.log('ALTER TABLE club_meta_overrides ADD notable_alumni...')
await pool.query(`
  ALTER TABLE club_meta_overrides
    ADD COLUMN IF NOT EXISTS notable_alumni JSONB
`)
console.log('✅ done.')
await pool.end()
