// JLSP の結果ページに表示する「クラブ説明文 / マスコット説明文」を
// ryo さんが UI から編集できるようにするための上書き用テーブル。
//
// 静的データ (lib/jlsp/club-meta.js) は AI 生成のデフォルト。
// このテーブルに行があれば JLSP は override 値を優先表示する。
//
// 実行:
//   node --env-file=.env.local scripts/migrations/009_create_club_meta_overrides.mjs

import { Pool } from '@neondatabase/serverless'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

console.log('CREATE TABLE club_meta_overrides...')
await pool.query(`
  CREATE TABLE IF NOT EXISTS club_meta_overrides (
    club_id            TEXT PRIMARY KEY,
    description_long   TEXT,
    mascot_name        TEXT,
    mascot_description TEXT,
    mascot_wiki_title  TEXT,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`)

console.log('✅ done. 行数:')
const r = await pool.query('SELECT COUNT(*)::int AS n FROM club_meta_overrides')
console.log('   ', r.rows[0].n)

await pool.end()
