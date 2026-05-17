// JLSP 用テーブル作成 + 既存 JSON データのシード
//
// 使い方:
//   cd /Users/ryo/Desktop/jleakstats
//   node .claude/worktrees/hopeful-hugle-b971e1/scripts/jlsp_create_and_seed.mjs
//
// 冪等: CREATE IF NOT EXISTS + ON CONFLICT で何度走らせても OK
import { neon } from '@neondatabase/serverless'
import dotenv from 'dotenv'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

dotenv.config({ path: '/Users/ryo/Desktop/jleakstats/.env.local' })
const sql = neon(process.env.DATABASE_URL)

const __dirname = dirname(fileURLToPath(import.meta.url))
const LIB_JLSP = join(__dirname, '..', 'lib', 'jlsp')

console.log('1. CREATE TABLE jlsp_vector_overrides')
await sql`
  CREATE TABLE IF NOT EXISTS jlsp_vector_overrides (
    club_id    TEXT    NOT NULL,
    axis_id    TEXT    NOT NULL,
    value      INTEGER NOT NULL CHECK (value BETWEEN -2 AND 2),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (club_id, axis_id)
  )
`

console.log('2. CREATE TABLE jlsp_question_overrides')
await sql`
  CREATE TABLE IF NOT EXISTS jlsp_question_overrides (
    club_id     TEXT    NOT NULL,
    question_id TEXT    NOT NULL,
    value       INTEGER NOT NULL CHECK (value BETWEEN -3 AND 3),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (club_id, question_id)
  )
`

console.log('3. シード: vectors.json → jlsp_vector_overrides')
const vectors = JSON.parse(readFileSync(join(LIB_JLSP, 'vectors.json'), 'utf-8'))
let vCount = 0
for (const [clubId, axes] of Object.entries(vectors)) {
  for (const [axisId, value] of Object.entries(axes)) {
    await sql`
      INSERT INTO jlsp_vector_overrides (club_id, axis_id, value)
      VALUES (${clubId}, ${axisId}, ${value})
      ON CONFLICT (club_id, axis_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
    vCount++
  }
}
console.log(`   → ${vCount} rows`)

console.log('4. シード: overrides.json → jlsp_question_overrides')
const overrides = JSON.parse(readFileSync(join(LIB_JLSP, 'overrides.json'), 'utf-8'))
let qCount = 0
for (const [clubId, questions] of Object.entries(overrides)) {
  for (const [questionId, value] of Object.entries(questions)) {
    await sql`
      INSERT INTO jlsp_question_overrides (club_id, question_id, value)
      VALUES (${clubId}, ${questionId}, ${value})
      ON CONFLICT (club_id, question_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
    qCount++
  }
}
console.log(`   → ${qCount} rows`)

console.log('\n完了。サマリ:')
const [{ count: vTotal }] = await sql`SELECT COUNT(*)::int AS count FROM jlsp_vector_overrides`
const [{ count: qTotal }] = await sql`SELECT COUNT(*)::int AS count FROM jlsp_question_overrides`
console.log(`  jlsp_vector_overrides:   ${vTotal} rows`)
console.log(`  jlsp_question_overrides: ${qTotal} rows`)
