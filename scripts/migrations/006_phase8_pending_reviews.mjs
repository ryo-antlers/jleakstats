// Phase 8: pending_reviews テーブル追加
//
// auto-link で解決できない外部ID紐付けを溜めて、admin で人間が解決する
//
// 実行: node --env-file=.env.local scripts/migrations/006_phase8_pending_reviews.mjs

import { neon } from '@neondatabase/serverless'
const sql = neon(process.env.DATABASE_URL)

console.log('=== Phase 8: pending_reviews スキーマ追加 ===\n')

await sql`
  CREATE TABLE IF NOT EXISTS pending_reviews (
    id                    SERIAL PRIMARY KEY,
    source                TEXT NOT NULL,        -- 'api-football' | 'j-league' | ...
    external_id           TEXT NOT NULL,
    observed_name         TEXT,                  -- 観測時の名前 (English / Japanese どちらでも)
    observed_team_id      INT,
    observed_dob          DATE,                  -- 観測時の dob (あれば)
    candidate_canonicals  INT[],                 -- マッチ候補があれば (曖昧時)
    reason                TEXT,                  -- 'no_dob' | 'no_match' | 'ambiguous' | 'team_mismatch'
    status                TEXT DEFAULT 'pending',-- 'pending' | 'resolved' | 'skipped'
    resolved_canonical_id INT,
    resolved_by           TEXT,
    resolved_at           TIMESTAMP,
    created_at            TIMESTAMP DEFAULT NOW(),
    UNIQUE (source, external_id)
  )
`
await sql`CREATE INDEX IF NOT EXISTS idx_pending_reviews_status ON pending_reviews (status)`
await sql`CREATE INDEX IF NOT EXISTS idx_pending_reviews_created ON pending_reviews (created_at DESC)`

console.log('✓ pending_reviews テーブル作成')

const count = await sql`SELECT COUNT(*) AS c FROM pending_reviews`
console.log(`現在の件数: ${count[0].c}`)

await sql`
  INSERT INTO canonical_audit_log (action, payload, actor)
  VALUES ('phase8_init', ${JSON.stringify({ table: 'pending_reviews', ran_at: new Date().toISOString() })}::jsonb, 'migration-script')
`

console.log('\n✅ Phase 8 スキーマ追加 完了')
