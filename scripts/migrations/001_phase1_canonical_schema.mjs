// Phase 1: canonical model のスキーマ追加 + 既存データ backfill
//
// 追加するもの (3テーブル):
//   - player_external_ids   : 外部システムID紐付け (1 canonical → 0..* 外部ID)
//   - player_aliases        : 表記揺れ吸収          (1 canonical → 0..* 表記)
//   - canonical_audit_log   : 全 merge/split/alias/外部ID追加 操作の監査ログ
//
// Backfill (既存データから派生):
//   - players_master.id (1〜8,999,999) → external_ids (source='api-football')
//     (負ID と 9M+ は API-Football 由来でないので backfill 対象外)
//   - players_master.name_ja → aliases (normalized = NFKC + 空白/中黒除去)
//
// 既存テーブルには触らない (純粋に追加のみ・冪等)
//
// 実行: node --env-file=.env.local scripts/migrations/001_phase1_canonical_schema.mjs

import { Pool } from '@neondatabase/serverless'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// 名前正規化: NFKC + 空白(半/全/イデオグラフィック)・中黒(・)除去 + 小文字化
function normalizeName(s) {
  if (!s) return null
  return s.normalize('NFKC').replace(/[\s　・]+/g, '').toLowerCase()
}

console.log('\n=== Phase 1: スキーマ追加 + backfill ===\n')

// ─── Step 1: スキーマ作成 ─────────────────────────────────
console.log('[1/5] CREATE TABLE player_external_ids')
await pool.query(`
  CREATE TABLE IF NOT EXISTS player_external_ids (
    canonical_id  INT  NOT NULL REFERENCES players_master(id) ON DELETE CASCADE,
    source        TEXT NOT NULL,
    external_id   TEXT NOT NULL,
    observed_at   TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (source, external_id)
  )
`)
await pool.query(`CREATE INDEX IF NOT EXISTS idx_player_external_ids_canonical ON player_external_ids (canonical_id)`)

console.log('[2/5] CREATE TABLE player_aliases')
await pool.query(`
  CREATE TABLE IF NOT EXISTS player_aliases (
    canonical_id  INT  NOT NULL REFERENCES players_master(id) ON DELETE CASCADE,
    name_ja       TEXT NOT NULL,
    normalized    TEXT NOT NULL,
    source        TEXT,
    confidence    TEXT DEFAULT 'confirmed',
    created_at    TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (canonical_id, normalized)
  )
`)
await pool.query(`CREATE INDEX IF NOT EXISTS idx_player_aliases_normalized ON player_aliases (normalized)`)

console.log('[3/5] CREATE TABLE canonical_audit_log')
await pool.query(`
  CREATE TABLE IF NOT EXISTS canonical_audit_log (
    id            SERIAL PRIMARY KEY,
    action        TEXT NOT NULL,
    canonical_id  INT,
    target_id     INT,
    payload       JSONB,
    actor         TEXT,
    created_at    TIMESTAMP DEFAULT NOW()
  )
`)
await pool.query(`CREATE INDEX IF NOT EXISTS idx_canonical_audit_log_canonical ON canonical_audit_log (canonical_id)`)
await pool.query(`CREATE INDEX IF NOT EXISTS idx_canonical_audit_log_created ON canonical_audit_log (created_at DESC)`)

console.log('  ✓ 3テーブル作成完了\n')

// ─── Step 2: external_ids backfill ─────────────────────
console.log('[4/5] Backfill player_external_ids')
const beforeExt = (await pool.query(`SELECT COUNT(*)::int AS cnt FROM player_external_ids`)).rows[0].cnt

// id 1〜8,999,999 = API-Football ID 帯
// canonical_id がある場合は merge 先に紐付ける (重複の片割れも external として残す)
await pool.query(`
  INSERT INTO player_external_ids (canonical_id, source, external_id)
  SELECT
    COALESCE(canonical_id, id) AS canonical_id,
    'api-football',
    id::text
  FROM players_master
  WHERE id BETWEEN 1 AND 8999999
  ON CONFLICT (source, external_id) DO NOTHING
`)

const afterExt = (await pool.query(`SELECT COUNT(*)::int AS cnt FROM player_external_ids`)).rows[0].cnt
console.log(`  ✓ ${afterExt - beforeExt} 件 INSERT (合計 ${afterExt})\n`)

// ─── Step 3: aliases backfill ──────────────────────────
console.log('[5/5] Backfill player_aliases (NFKC + 空白/中黒除去)')
const beforeAlias = (await pool.query(`SELECT COUNT(*)::int AS cnt FROM player_aliases`)).rows[0].cnt

// JS 側で normalize するため行を取得
const rows = (await pool.query(`
  SELECT id, COALESCE(canonical_id, id) AS canonical_id, name_ja
  FROM players_master
  WHERE name_ja IS NOT NULL
`)).rows

// バッチ INSERT (パラメータ数の上限考慮で 500件ずつ)
const BATCH = 500
let processed = 0
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH)
  const values = []
  const params = []
  for (const r of batch) {
    const norm = normalizeName(r.name_ja)
    if (!norm) continue
    const off = params.length
    values.push(`($${off+1}, $${off+2}, $${off+3}, $${off+4})`)
    params.push(r.canonical_id, r.name_ja, norm, 'backfill')
  }
  if (values.length === 0) continue
  await pool.query(
    `INSERT INTO player_aliases (canonical_id, name_ja, normalized, source)
     VALUES ${values.join(',')}
     ON CONFLICT (canonical_id, normalized) DO NOTHING`,
    params
  )
  processed += batch.length
}

const afterAlias = (await pool.query(`SELECT COUNT(*)::int AS cnt FROM player_aliases`)).rows[0].cnt
console.log(`  ✓ ${rows.length} 行を処理、 ${afterAlias - beforeAlias} 件 INSERT (合計 ${afterAlias})\n`)

// ─── Step 4: 監査ログに完了記録 ─────────────────────────
await pool.query(`
  INSERT INTO canonical_audit_log (action, payload, actor)
  VALUES ('phase1_init', $1::jsonb, 'migration-script')
`, [JSON.stringify({
  external_ids_inserted: afterExt - beforeExt,
  aliases_inserted: afterAlias - beforeAlias,
  total_external_ids: afterExt,
  total_aliases: afterAlias,
  ran_at: new Date().toISOString(),
})])

// ─── Step 5: 検証 ──────────────────────────────────────
console.log('=== 検証 ===\n')

const expectExt = (await pool.query(`
  SELECT COUNT(*)::int AS cnt FROM players_master WHERE id BETWEEN 1 AND 8999999
`)).rows[0].cnt
const expectAlias = (await pool.query(`
  SELECT COUNT(*)::int AS cnt FROM (
    SELECT DISTINCT COALESCE(canonical_id, id), $1 || name_ja FROM players_master WHERE name_ja IS NOT NULL
  ) t
`, [''])).rows[0].cnt

console.log(`  期待 external_ids 件数 (id 1〜8.99M): ${expectExt}`)
console.log(`  実際 external_ids 件数              : ${afterExt}`)
console.log(`  ${afterExt === expectExt ? '✓' : '✗'} 一致\n`)

console.log(`  期待 aliases 件数 (大体 7775前後)   : ~${expectAlias}`)
console.log(`  実際 aliases 件数                   : ${afterAlias}`)
console.log(`  ※ 同一人物の重複表記は1件にまとめられるため期待値より少ないことがある\n`)

// alias の正規化動作サンプル
console.log('  alias 正規化サンプル:')
const sample = (await pool.query(`
  SELECT canonical_id, name_ja, normalized
  FROM player_aliases
  WHERE name_ja LIKE '% %' OR name_ja LIKE '%・%' OR name_ja LIKE '%　%'
  ORDER BY canonical_id
  LIMIT 5
`)).rows
console.table(sample)

// マテウス問題が「将来 canonical で集計したらどう変わるか」の事前確認
console.log('\n  マテウス確認 (現状の external_ids 紐付け):')
const mateus = (await pool.query(`
  SELECT pm.id, pm.name_ja, pm.team_id, pm.position,
         (SELECT external_id FROM player_external_ids WHERE canonical_id=pm.id AND source='api-football') AS af_id
  FROM players_master pm
  WHERE pm.name_ja = 'マテウス'
  ORDER BY pm.id
`)).rows
console.table(mateus)

console.log('\n✅ Phase 1 完了')
console.log('   次: Phase 2 (CSV import スクリプト) に進む')

await pool.end()
