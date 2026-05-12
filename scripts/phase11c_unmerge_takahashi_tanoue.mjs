/**
 * Phase 11c: 髙橋直也/田上大地 の誤統合を分離
 *
 * 昨日 admin/duplicates で別人を一括 merge した残り 2 件:
 *   audit 512: winner=9000126 髙橋直也 (2001生 湘南) ← loser=10001032 高橋直也 (2004生 鳥取) [別人]
 *   audit 531: winner=33602 田上大地 (1993生 岡山) ← loser=10001116 田上大地 (1997生 熊本) [別人]
 *
 * loser はどちらも外部ID なし・試合データなしの単独 canonical だったので
 * canonical_id を null に戻すだけで分離完了。
 *
 * Usage:
 *   node scripts/phase11c_unmerge_takahashi_tanoue.mjs           # preview
 *   node scripts/phase11c_unmerge_takahashi_tanoue.mjs --apply
 */
import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
dotenv.config({ path: "/Users/ryo/Desktop/jleakstats/.env.local" });
const sql = neon(process.env.DATABASE_URL);

const APPLY = process.argv.includes("--apply");

const moves = [
  { id: 10001032, was: 9000126, name: '高橋 直也 (2004生 鳥取)', winner_name: '髙橋 直也' },
  { id: 10001116, was: 33602,   name: '田上 大地 (1997生 熊本)', winner_name: '田上 大地' },
];

const aliasDeletes = [
  // 同名 alias は dob で区別できないので、loser 名 と完全一致するものだけ winner から削除
  // ただし「髙橋直也」と「高橋直也」、「田上大地」両方とも同字なので、winner にも本来同じ alias が必要
  // → alias 削除はせず、canonical_id 戻しだけにする
];

console.log("=== Preview ===");
for (const m of moves) {
  console.log(`  unalias: ${m.id} (${m.name}) was alias of ${m.was}`);
}

if (!APPLY) {
  console.log("\nDry-run. Run with --apply to commit.");
  process.exit(0);
}

console.log("\n=== APPLY ===");
for (const m of moves) {
  await sql`UPDATE players_master SET canonical_id = NULL WHERE id = ${m.id}`;
  console.log(`  ✓ ${m.id} canonical_id = NULL`);
}

await sql`
  INSERT INTO canonical_audit_log (action, canonical_id, target_id, payload, actor, created_at)
  VALUES ('phase11c_unmerge', NULL, NULL,
          ${{
            reason: '昨日 admin で別人 (生年違い) を統合した 2件を分離',
            unaliased: moves.map(m => ({ id: m.id, name: m.name, was: m.was })),
          }},
          'phase11c', NOW())
`;
console.log("  ✓ audit log inserted");

console.log("\n=== Final state ===");
const final = await sql`
  SELECT pm.id, pm.name_ja, pm.dob::date AS dob, pm.canonical_id, tm.name_ja AS team
    FROM players_master pm
    LEFT JOIN teams_master tm ON pm.team_id=tm.id
   WHERE pm.id IN (9000126, 10001032, 33602, 10001116)
   ORDER BY pm.id
`;
console.table(final);
