/**
 * Phase 11b: 山崎倫/大澤朋也/大沢朋也 の誤統合を分離
 *
 * 昨日 admin/duplicates で 4 canonical を 9005067 (山崎倫) に誤統合。実は全員別人:
 *   9005067 = 山崎 倫     (2003-05-19 MF, 鹿児島)              ← 維持
 *   9005143 = 山﨑 倫     (異字 alias)                          ← 9005067 統合継続 (正しい)
 *   9004660 = 大澤 朋也   (2002-09-06 FW, 金沢)                 ← 分離
 *   9005570 = 大沢 朋也   (1984-10-22 MF, 引退、元讃岐)         ← 分離
 *
 * Usage:
 *   node scripts/phase11b_unmerge_yamazaki_osawa.mjs           # preview
 *   node scripts/phase11b_unmerge_yamazaki_osawa.mjs --apply
 */

import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
dotenv.config({ path: "/Users/ryo/Desktop/jleakstats/.env.local" });
const sql = neon(process.env.DATABASE_URL);

const APPLY = process.argv.includes("--apply");

// 鹿児島 team_id
const [{ id: KAGOSHIMA_ID }] = await sql`SELECT id FROM teams_master WHERE name_ja='鹿児島ユナイテッドFC'`;

const moves = [
  // 9004660 (大澤朋也) を独立化
  { type: 'unalias', id: 9004660, was: 9005067, name: '大澤 朋也' },
  // 9005570 (大沢朋也) を独立化
  { type: 'unalias', id: 9005570, was: 9005067, name: '大沢 朋也' },
  // 9005143 (山﨑倫 異字) は 9005067 統合継続なので触らない
];

const externalIdMoves = [
  // jl5=37870 (2002-09-06 FW 大宮 = 大澤朋也) → 9004660
  { source: 'j-league', external_id: '37870', from: 9005067, to: 9004660, owner: '大澤朋也' },
  // jl7=1631739 (大澤朋也の今シーズン金沢) → 9004660
  { source: 'j-league-jp', external_id: '1631739', from: 9005067, to: 9004660, owner: '大澤朋也' },
  // jl5=7463 (1984-10-22 MF 大宮 = 大沢朋也) → 9005570
  { source: 'j-league', external_id: '7463', from: 9005067, to: 9005570, owner: '大沢朋也' },
];

const aliasDeletes = [
  // 9005067 から「大沢朋也」「大澤朋也」alias を削除 (= 名前マッチを切る)
  { canonical_id: 9005067, normalized: '大沢朋也' },
  { canonical_id: 9005067, normalized: '大澤朋也' },
];

const teamFix = {
  id: 9005067,
  to_team_id: KAGOSHIMA_ID,
  reason: '今日の cron で 大澤朋也の jl7 紐付けにより 山崎倫 を金沢へ誤って transfer された。鹿児島に戻す',
};

console.log("=== Preview ===");
console.log("  unalias (canonical_id=null に戻す):");
for (const m of moves) console.log(`    - ${m.id} (${m.name}) was alias of ${m.was}`);

console.log("  external_ids 移動:");
for (const e of externalIdMoves) console.log(`    - source=${e.source} ext=${e.external_id} : ${e.from} -> ${e.to} (${e.owner})`);

console.log("  alias 削除 (9005067 から):");
for (const a of aliasDeletes) console.log(`    - ${a.normalized}`);

console.log(`  team_id 修正: 9005067 -> team=${teamFix.to_team_id} (${teamFix.reason})`);

if (!APPLY) {
  console.log("\nDry-run. Run with --apply to commit.");
  process.exit(0);
}

console.log("\n=== APPLY ===");

// 1. 9004660 と 9005570 の canonical_id を null に
for (const m of moves) {
  await sql`UPDATE players_master SET canonical_id = NULL WHERE id = ${m.id}`;
  console.log(`  ✓ ${m.id} canonical_id = NULL`);
}

// 2. external_ids 移動
for (const e of externalIdMoves) {
  // 移動先に既存があるか確認 (重複回避)
  const dup = await sql`SELECT 1 FROM player_external_ids WHERE canonical_id=${e.to} AND source=${e.source} AND external_id=${e.external_id}`;
  if (dup.length) {
    await sql`DELETE FROM player_external_ids WHERE canonical_id=${e.from} AND source=${e.source} AND external_id=${e.external_id}`;
    console.log(`  ✓ ${e.source}/${e.external_id}: 既に ${e.to} にあるので ${e.from} 側削除`);
  } else {
    await sql`UPDATE player_external_ids SET canonical_id=${e.to} WHERE canonical_id=${e.from} AND source=${e.source} AND external_id=${e.external_id}`;
    console.log(`  ✓ ${e.source}/${e.external_id}: ${e.from} -> ${e.to}`);
  }
}

// 3. 9005067 から誤統合 alias 削除
for (const a of aliasDeletes) {
  const r = await sql`DELETE FROM player_aliases WHERE canonical_id=${a.canonical_id} AND normalized=${a.normalized} RETURNING name_ja`;
  console.log(`  ✓ alias 削除: ${a.canonical_id}/${a.normalized} (${r.length}件)`);
}

// 4. team_id 修正
await sql`UPDATE players_master SET team_id=${teamFix.to_team_id} WHERE id=${teamFix.id}`;
console.log(`  ✓ team_id 修正: ${teamFix.id} -> ${teamFix.to_team_id}`);

// 5. fixture_lineups の player_id は触らない (= 元の player_id を保持。canonical 統合解除で自動的に各 ID 配下になる)

// 6. canonical_audit_log
await sql`
  INSERT INTO canonical_audit_log (action, canonical_id, target_id, payload, actor, created_at)
  VALUES ('phase11b_unmerge', 9005067, NULL,
          ${{
            reason: '昨日 admin で 4 canonical を 9005067 に誤統合。実は全員別人 (山崎倫/大澤朋也/大沢朋也)',
            unaliased: [9004660, 9005570],
            external_ids_moved: externalIdMoves,
            aliases_deleted: aliasDeletes,
            team_fix: teamFix,
          }},
          'phase11b', NOW())
`;
console.log("  ✓ audit log inserted");

// 7. 最終確認
console.log("\n=== Final state ===");
const final = await sql`
  SELECT pm.id, pm.name_ja, pm.canonical_id, tm.name_ja AS team,
    (SELECT array_agg(external_id ORDER BY external_id) FROM player_external_ids WHERE canonical_id=pm.id AND source='j-league') AS jl5,
    (SELECT array_agg(external_id ORDER BY external_id) FROM player_external_ids WHERE canonical_id=pm.id AND source='j-league-jp') AS jl7
  FROM players_master pm
  LEFT JOIN teams_master tm ON pm.team_id=tm.id
  WHERE pm.id IN (9005067, 9005143, 9004660, 9005570)
  ORDER BY pm.id
`;
console.table(final);
