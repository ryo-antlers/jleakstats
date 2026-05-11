/**
 * Phase 10b: エドゥアルド系 fixture_lineups / fixture_events / fixture_player_stats 汚染整理
 *
 * Step 1: 33197 の V・ファーレン長崎 試合 → 10000307
 * Step 2: 9000400 の カマタマーレ讃岐 試合 → 10000308
 * Step 3: 9000400 の残り (Carlos Eduardo 部分) → 10000307 へ merge + 9000400 を alias 化
 *
 * Usage:
 *   node scripts/phase10b_eduardo_reassign.mjs                   # preview only
 *   node scripts/phase10b_eduardo_reassign.mjs --step 1 --apply  # 個別 step 実行
 *   node scripts/phase10b_eduardo_reassign.mjs --step 2 --apply
 *   node scripts/phase10b_eduardo_reassign.mjs --step 3 --apply
 */

import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
dotenv.config({ path: "/Users/ryo/Desktop/jleakstats/.env.local" });
const sql = neon(process.env.DATABASE_URL);

const args = process.argv.slice(2);
const STEP = args.includes("--step") ? Number(args[args.indexOf("--step") + 1]) : null;
const APPLY = args.includes("--apply");

const [{ id: NAGASAKI_ID }] = await sql`SELECT id FROM teams_master WHERE name_ja='V・ファーレン長崎'`;
const [{ id: SANUKI_ID  }] = await sql`SELECT id FROM teams_master WHERE name_ja='カマタマーレ讃岐'`;
console.log(`team_id 解決: 長崎=${NAGASAKI_ID} / 讃岐=${SANUKI_ID}`);

async function previewMove(fromId, toId, teamId, label) {
  const [lineups] = await sql`
    SELECT COUNT(*)::int AS n FROM fixture_lineups
    WHERE player_id = ${fromId} AND team_id = ${teamId}
  `;
  const [events] = await sql`
    SELECT COUNT(*)::int AS n FROM fixture_events
    WHERE player_id = ${fromId} AND team_id = ${teamId}
  `;
  const [stats] = await sql`
    SELECT COUNT(*)::int AS n FROM fixture_player_stats
    WHERE player_id = ${fromId} AND team_id = ${teamId}
  `;
  console.log(`\n[${label}] ${fromId} (team=${teamId}) → ${toId}`);
  console.log(`  fixture_lineups:       ${lineups.n} 行`);
  console.log(`  fixture_events:        ${events.n} 行`);
  console.log(`  fixture_player_stats:  ${stats.n} 行`);
  return { lineups: lineups.n, events: events.n, stats: stats.n };
}

async function applyMove(fromId, toId, teamId, label) {
  console.log(`\n>>> APPLY [${label}] ${fromId} (team=${teamId}) → ${toId}`);
  const r1 = await sql`UPDATE fixture_lineups SET player_id = ${toId} WHERE player_id = ${fromId} AND team_id = ${teamId} RETURNING fixture_id`;
  const r2 = await sql`UPDATE fixture_events  SET player_id = ${toId} WHERE player_id = ${fromId} AND team_id = ${teamId} RETURNING fixture_id`;
  const r3 = await sql`UPDATE fixture_player_stats SET player_id = ${toId} WHERE player_id = ${fromId} AND team_id = ${teamId} RETURNING fixture_id`;
  console.log(`  fixture_lineups:      ${r1.length} 行更新`);
  console.log(`  fixture_events:       ${r2.length} 行更新`);
  console.log(`  fixture_player_stats: ${r3.length} 行更新`);
  await sql`
    INSERT INTO canonical_audit_log (action, canonical_id, target_id, payload, actor, created_at)
    VALUES ('phase10b_reassign', null, ${toId},
            ${{ step: label, from: fromId, to: toId, team_id: teamId, lineups: r1.length, events: r2.length, stats: r3.length }},
            'phase10b', NOW())
  `;
}

async function previewMergeRemaining(fromId, toId) {
  // 9000400 の残り (=今すでに team=長崎/讃岐 以外の試合)
  const [lineups] = await sql`
    SELECT COUNT(*)::int AS n FROM fixture_lineups
    WHERE player_id = ${fromId}
  `;
  const [events] = await sql`
    SELECT COUNT(*)::int AS n FROM fixture_events WHERE player_id = ${fromId}
  `;
  const [stats] = await sql`
    SELECT COUNT(*)::int AS n FROM fixture_player_stats WHERE player_id = ${fromId}
  `;
  const externalIds = await sql`
    SELECT source, external_id FROM player_external_ids WHERE canonical_id = ${fromId}
  `;
  const aliases = await sql`
    SELECT * FROM player_aliases WHERE canonical_id = ${fromId}
  `;
  console.log(`\n[Step 3 preview] ${fromId} 残り → ${toId}`);
  console.log(`  fixture_lineups remaining: ${lineups.n} 行`);
  console.log(`  fixture_events  remaining: ${events.n} 行`);
  console.log(`  fixture_player_stats:      ${stats.n} 行`);
  console.log(`  player_external_ids:       ${externalIds.length} 行`, externalIds);
  console.log(`  player_aliases:            ${aliases.length} 行`);
  return { lineups: lineups.n, events: events.n, stats: stats.n, externalIds, aliases };
}

async function applyMergeRemaining(fromId, toId) {
  console.log(`\n>>> APPLY Step 3: merge ${fromId} → ${toId}`);
  const r1 = await sql`UPDATE fixture_lineups SET player_id = ${toId} WHERE player_id = ${fromId} RETURNING fixture_id`;
  const r2 = await sql`UPDATE fixture_events  SET player_id = ${toId} WHERE player_id = ${fromId} RETURNING fixture_id`;
  const r3 = await sql`UPDATE fixture_player_stats SET player_id = ${toId} WHERE player_id = ${fromId} RETURNING fixture_id`;
  // external_ids を 10000307 に紐付け替え (もし衝突したら old 側を消す)
  const exIds = await sql`SELECT source, external_id FROM player_external_ids WHERE canonical_id = ${fromId}`;
  for (const e of exIds) {
    const dup = await sql`SELECT 1 FROM player_external_ids WHERE canonical_id = ${toId} AND source = ${e.source} AND external_id = ${e.external_id}`;
    if (dup.length) {
      await sql`DELETE FROM player_external_ids WHERE canonical_id = ${fromId} AND source = ${e.source} AND external_id = ${e.external_id}`;
    } else {
      await sql`UPDATE player_external_ids SET canonical_id = ${toId} WHERE canonical_id = ${fromId} AND source = ${e.source} AND external_id = ${e.external_id}`;
    }
  }
  await sql`UPDATE player_aliases SET canonical_id = ${toId} WHERE canonical_id = ${fromId}`;
  // 9000400 を alias 化
  await sql`UPDATE players_master SET canonical_id = ${toId} WHERE id = ${fromId}`;
  console.log(`  fixture_lineups:      ${r1.length} 行`);
  console.log(`  fixture_events:       ${r2.length} 行`);
  console.log(`  fixture_player_stats: ${r3.length} 行`);
  console.log(`  external_ids:         ${exIds.length} 件 reassign`);
  console.log(`  players_master.canonical_id ${fromId}=>${toId} set`);
  await sql`
    INSERT INTO canonical_audit_log (action, canonical_id, target_id, payload, actor, created_at)
    VALUES ('phase10b_merge', ${fromId}, ${toId},
            ${{ step: 'Step 3', from: fromId, to: toId, lineups: r1.length, events: r2.length, stats: r3.length, externalIds: exIds.length }},
            'phase10b', NOW())
  `;
}

console.log("=== Preview (現状確認) ===");
await previewMove(33197, 10000307, NAGASAKI_ID, "Step 1: 33197 長崎 → 10000307");
await previewMove(9000400, 10000308, SANUKI_ID,  "Step 2: 9000400 讃岐 → 10000308");
// Step 3 は Step 1/2 後の残数を見るので、step=3 のときだけ別途実行
if (STEP === 3 || (!APPLY && STEP == null)) {
  await previewMergeRemaining(9000400, 10000307);
}

if (APPLY && STEP === 1) await applyMove(33197, 10000307, NAGASAKI_ID, "Step 1");
if (APPLY && STEP === 2) await applyMove(9000400, 10000308, SANUKI_ID,  "Step 2");
if (APPLY && STEP === 3) await applyMergeRemaining(9000400, 10000307);
