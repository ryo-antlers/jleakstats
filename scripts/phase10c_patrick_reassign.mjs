/**
 * Phase 10c: パトリック系 fixture_lineups / fixture_events / fixture_player_stats 汚染整理
 *
 * Step 1: 9000284 の 大分トリニータ 試合 → 10001484 (Zwaanswijk)
 * Step 2: 9000284 の 横浜FC 試合 → 10001486 (Marins)
 * Step 3: 9000284 の残り → 10001485 (Aguiar) へ merge + 9000284 を alias 化
 *
 * Usage:
 *   node scripts/phase10c_patrick_reassign.mjs                   # preview only
 *   node scripts/phase10c_patrick_reassign.mjs --step 1 --apply
 *   node scripts/phase10c_patrick_reassign.mjs --step 2 --apply
 *   node scripts/phase10c_patrick_reassign.mjs --step 3 --apply
 */

import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
dotenv.config({ path: "/Users/ryo/Desktop/jleakstats/.env.local" });
const sql = neon(process.env.DATABASE_URL);

const args = process.argv.slice(2);
const STEP = args.includes("--step") ? Number(args[args.indexOf("--step") + 1]) : null;
const APPLY = args.includes("--apply");

const [{ id: OITA_ID }]      = await sql`SELECT id FROM teams_master WHERE name_ja='大分トリニータ'`;
const [{ id: YOKOHAMA_FC }]  = await sql`SELECT id FROM teams_master WHERE name_ja='横浜FC'`;
console.log(`team_id 解決: 大分=${OITA_ID} / 横浜FC=${YOKOHAMA_FC}`);

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
    VALUES ('phase10c_reassign', null, ${toId},
            ${{ step: label, from: fromId, to: toId, team_id: teamId, lineups: r1.length, events: r2.length, stats: r3.length }},
            'phase10c', NOW())
  `;
}

async function previewMergeRemaining(fromId, toId) {
  const [lineups] = await sql`SELECT COUNT(*)::int AS n FROM fixture_lineups WHERE player_id = ${fromId}`;
  const [events]  = await sql`SELECT COUNT(*)::int AS n FROM fixture_events  WHERE player_id = ${fromId}`;
  const [stats]   = await sql`SELECT COUNT(*)::int AS n FROM fixture_player_stats WHERE player_id = ${fromId}`;
  const externalIds = await sql`SELECT source, external_id FROM player_external_ids WHERE canonical_id = ${fromId}`;
  const aliases = await sql`SELECT * FROM player_aliases WHERE canonical_id = ${fromId}`;
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
  // external_ids
  const exIds = await sql`SELECT source, external_id FROM player_external_ids WHERE canonical_id = ${fromId}`;
  for (const e of exIds) {
    const dup = await sql`SELECT 1 FROM player_external_ids WHERE canonical_id = ${toId} AND source = ${e.source} AND external_id = ${e.external_id}`;
    if (dup.length) {
      await sql`DELETE FROM player_external_ids WHERE canonical_id = ${fromId} AND source = ${e.source} AND external_id = ${e.external_id}`;
    } else {
      await sql`UPDATE player_external_ids SET canonical_id = ${toId} WHERE canonical_id = ${fromId} AND source = ${e.source} AND external_id = ${e.external_id}`;
    }
  }
  // aliases (重複あれば削除、なければ移動)
  const aliases = await sql`SELECT * FROM player_aliases WHERE canonical_id = ${fromId}`;
  for (const a of aliases) {
    const dup = await sql`SELECT 1 FROM player_aliases WHERE canonical_id = ${toId} AND normalized = ${a.normalized}`;
    if (dup.length) {
      await sql`DELETE FROM player_aliases WHERE canonical_id = ${fromId} AND normalized = ${a.normalized}`;
    } else {
      await sql`UPDATE player_aliases SET canonical_id = ${toId} WHERE canonical_id = ${fromId} AND normalized = ${a.normalized}`;
    }
  }
  // 9000284 を alias 化
  await sql`UPDATE players_master SET canonical_id = ${toId} WHERE id = ${fromId}`;
  console.log(`  fixture_lineups:      ${r1.length} 行`);
  console.log(`  fixture_events:       ${r2.length} 行`);
  console.log(`  fixture_player_stats: ${r3.length} 行`);
  console.log(`  external_ids:         ${exIds.length} 件処理`);
  console.log(`  aliases:              ${aliases.length} 件処理`);
  console.log(`  players_master.canonical_id ${fromId}=>${toId} set`);
  await sql`
    INSERT INTO canonical_audit_log (action, canonical_id, target_id, payload, actor, created_at)
    VALUES ('phase10c_merge', ${fromId}, ${toId},
            ${{ step: 'Step 3', from: fromId, to: toId, lineups: r1.length, events: r2.length, stats: r3.length, externalIds: exIds.length, aliases: aliases.length }},
            'phase10c', NOW())
  `;
}

console.log("=== Preview ===");
await previewMove(9000284, 10001484, OITA_ID,     "Step 1: 9000284 大分 → 10001484 (Zwaanswijk)");
await previewMove(9000284, 10001486, YOKOHAMA_FC, "Step 2: 9000284 横浜FC → 10001486 (Marins)");
if (STEP === 3 || (!APPLY && STEP == null)) {
  await previewMergeRemaining(9000284, 10001485);
}

if (APPLY && STEP === 1) await applyMove(9000284, 10001484, OITA_ID,     "Step 1");
if (APPLY && STEP === 2) await applyMove(9000284, 10001486, YOKOHAMA_FC, "Step 2");
if (APPLY && STEP === 3) await applyMergeRemaining(9000284, 10001485);
