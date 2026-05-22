// 海外でプレーする日本人選手の現所属情報を保持するテーブル。
//
// JLSP 結果ページの「現在は海外でプレーしている選手」セクションのバックエンド。
// discover_japanese_overseas.mjs (および後続の日次 sync) がこのテーブルを upsert する。
//
// 1 canonical_id = 1 行 = 「現在所属している海外クラブ」のスナップショット。
// 海外を離れた選手は別途 sync 時に DELETE して落とす想定。
//
// 実行: node --env-file=.env.local scripts/migrations/007_create_overseas_status.mjs

import { Pool } from '@neondatabase/serverless'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

console.log('\n=== Phase: player_overseas_status 作成 ===\n')

console.log('[1/2] CREATE TABLE player_overseas_status')
await pool.query(`
  CREATE TABLE IF NOT EXISTS player_overseas_status (
    canonical_id    INT PRIMARY KEY REFERENCES players_master(id) ON DELETE CASCADE,
    api_football_id INT,
    team_id         INT,            -- API-Football team id
    team_name       TEXT NOT NULL,
    team_logo       TEXT,
    league_id       INT NOT NULL,   -- API-Football league id
    league_name     TEXT NOT NULL,
    country         TEXT NOT NULL,
    season          INT NOT NULL,
    position        TEXT,
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`)

console.log('[2/2] CREATE INDEX')
await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_overseas_status_team
    ON player_overseas_status (team_id)
`)

const { rows } = await pool.query(`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'player_overseas_status'
`)
console.table(rows)

console.log('Done.')
await pool.end()
