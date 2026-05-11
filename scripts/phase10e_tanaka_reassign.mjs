/**
 * Phase 10e: 田中雄大系汚染整理
 *
 * 9001364 (札幌/dob無し canonical, 551試合) に混在する 3 人を SFIX04 経歴に基づき分配。
 *
 *  - 10001097 (1988生 DF): 2011-2019 川崎F→栃木→鳥取→水戸→神戸→札幌→秋田
 *  - 10001098 (1999-12生 MF): 2022-2026 岡山→甲府→鳥栖
 *  - 10001099 (1995生 GK): 2018-2022 相模原→秋田
 *
 * Usage:
 *   node scripts/phase10e_tanaka_reassign.mjs                       # preview only
 *   node scripts/phase10e_tanaka_reassign.mjs --apply-all
 */

import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
dotenv.config({ path: "/Users/ryo/Desktop/jleakstats/.env.local" });
const sql = neon(process.env.DATABASE_URL);

const args = process.argv.slice(2);
const APPLY_ALL = args.includes("--apply-all");

const FROM = 9001364;
const MERGE_TARGET = 10001097; // 最大キャリア (1988生) を alias 先に

async function teamId(name) {
  const r = await sql`SELECT id FROM teams_master WHERE name_ja = ${name}`;
  if (!r[0]) throw new Error(`team not found: ${name}`);
  return r[0].id;
}

const T = {
  kawasaki: await teamId("川崎フロンターレ"),
  tochigi:  await teamId("栃木SC"),
  tottori:  await teamId("ガイナーレ鳥取"),
  mito:     await teamId("水戸ホーリーホック"),
  kobe:     await teamId("ヴィッセル神戸"),
  sapporo:  await teamId("北海道コンサドーレ札幌"),
  akita:    await teamId("ブラウブリッツ秋田"),
  sagamihara: await teamId("SC相模原"),
  okayama:  await teamId("ファジアーノ岡山"),
  kofu:     await teamId("ヴァンフォーレ甲府"),
  tosu:     await teamId("サガン鳥栖"),
};

const STEPS = [
  // 10001097 (1988生 DF)
  { step:  1, to: 10001097, team: T.kawasaki,   teamName: "川崎F",  seasons: [2011, 2012] },
  { step:  2, to: 10001097, team: T.tochigi,    teamName: "栃木",   seasons: [2012] },
  { step:  3, to: 10001097, team: T.tottori,    teamName: "鳥取",   seasons: [2013] },
  { step:  4, to: 10001097, team: T.mito,       teamName: "水戸",   seasons: [2014, 2015] },
  { step:  5, to: 10001097, team: T.kobe,       teamName: "神戸",   seasons: [2016] },
  { step:  6, to: 10001097, team: T.sapporo,    teamName: "札幌",   seasons: [2017, 2018] },
  { step:  7, to: 10001097, team: T.akita,      teamName: "秋田",   seasons: [2019] },
  // 10001099 (1995生 GK)
  { step:  8, to: 10001099, team: T.sagamihara, teamName: "相模原", seasons: [2018, 2019] },
  { step:  9, to: 10001099, team: T.akita,      teamName: "秋田",   seasons: [2020, 2021, 2022] },
  // 10001098 (1999-12生 MF)
  { step: 10, to: 10001098, team: T.okayama,    teamName: "岡山",   seasons: [2022, 2023, 2024] },
  { step: 11, to: 10001098, team: T.kofu,       teamName: "甲府",   seasons: [2025] },
  { step: 12, to: 10001098, team: T.tosu,       teamName: "鳥栖",   seasons: [2026] },
];

async function preview(s) {
  const [lineups] = await sql`
    SELECT COUNT(*)::int AS n FROM fixture_lineups fl
    JOIN fixtures f ON fl.fixture_id = f.id
    WHERE fl.player_id = ${FROM} AND fl.team_id = ${s.team} AND f.season = ANY(${s.seasons})
  `;
  const [events] = await sql`
    SELECT COUNT(*)::int AS n FROM fixture_events fe
    JOIN fixtures f ON fe.fixture_id = f.id
    WHERE fe.player_id = ${FROM} AND fe.team_id = ${s.team} AND f.season = ANY(${s.seasons})
  `;
  const [stats] = await sql`
    SELECT COUNT(*)::int AS n FROM fixture_player_stats fps
    JOIN fixtures f ON fps.fixture_id = f.id
    WHERE fps.player_id = ${FROM} AND fps.team_id = ${s.team} AND f.season = ANY(${s.seasons})
  `;
  console.log(`  Step ${String(s.step).padStart(2)}: ${s.teamName.padEnd(7)} ${s.seasons.join("-").padEnd(15)} lineups=${lineups.n} events=${events.n} → ${s.to}`);
  return lineups.n;
}

async function applyOne(s) {
  const r1 = await sql`
    UPDATE fixture_lineups SET player_id = ${s.to}
    FROM fixtures f
    WHERE fixture_lineups.fixture_id = f.id
      AND fixture_lineups.player_id = ${FROM}
      AND fixture_lineups.team_id = ${s.team}
      AND f.season = ANY(${s.seasons})
    RETURNING fixture_lineups.fixture_id
  `;
  const r2 = await sql`
    UPDATE fixture_events SET player_id = ${s.to}
    FROM fixtures f
    WHERE fixture_events.fixture_id = f.id
      AND fixture_events.player_id = ${FROM}
      AND fixture_events.team_id = ${s.team}
      AND f.season = ANY(${s.seasons})
    RETURNING fixture_events.fixture_id
  `;
  const r3 = await sql`
    UPDATE fixture_player_stats SET player_id = ${s.to}
    FROM fixtures f
    WHERE fixture_player_stats.fixture_id = f.id
      AND fixture_player_stats.player_id = ${FROM}
      AND fixture_player_stats.team_id = ${s.team}
      AND f.season = ANY(${s.seasons})
    RETURNING fixture_player_stats.fixture_id
  `;
  console.log(`  Step ${s.step} applied: lineups=${r1.length} events=${r2.length} stats=${r3.length}`);
  await sql`
    INSERT INTO canonical_audit_log (action, canonical_id, target_id, payload, actor, created_at)
    VALUES ('phase10e_reassign', null, ${s.to},
            ${{ step: s.step, team: s.teamName, seasons: s.seasons, from: FROM, to: s.to, lineups: r1.length, events: r2.length, stats: r3.length }},
            'phase10e', NOW())
  `;
}

async function finalize(toId) {
  console.log(`\n>>> FINALIZE: 9001364 残→${toId} merge + alias 化`);
  const r1 = await sql`UPDATE fixture_lineups SET player_id = ${toId} WHERE player_id = ${FROM} RETURNING fixture_id`;
  const r2 = await sql`UPDATE fixture_events  SET player_id = ${toId} WHERE player_id = ${FROM} RETURNING fixture_id`;
  const r3 = await sql`UPDATE fixture_player_stats SET player_id = ${toId} WHERE player_id = ${FROM} RETURNING fixture_id`;
  console.log(`  residual lineups=${r1.length} events=${r2.length} stats=${r3.length}`);
  const exIds = await sql`SELECT source, external_id FROM player_external_ids WHERE canonical_id = ${FROM}`;
  for (const e of exIds) {
    const dup = await sql`SELECT 1 FROM player_external_ids WHERE canonical_id = ${toId} AND source = ${e.source} AND external_id = ${e.external_id}`;
    if (dup.length) await sql`DELETE FROM player_external_ids WHERE canonical_id = ${FROM} AND source = ${e.source} AND external_id = ${e.external_id}`;
    else            await sql`UPDATE player_external_ids SET canonical_id = ${toId} WHERE canonical_id = ${FROM} AND source = ${e.source} AND external_id = ${e.external_id}`;
  }
  const aliases = await sql`SELECT * FROM player_aliases WHERE canonical_id = ${FROM}`;
  for (const a of aliases) {
    const dup = await sql`SELECT 1 FROM player_aliases WHERE canonical_id = ${toId} AND normalized = ${a.normalized}`;
    if (dup.length) await sql`DELETE FROM player_aliases WHERE canonical_id = ${FROM} AND normalized = ${a.normalized}`;
    else            await sql`UPDATE player_aliases SET canonical_id = ${toId} WHERE canonical_id = ${FROM} AND normalized = ${a.normalized}`;
  }
  await sql`UPDATE players_master SET canonical_id = ${toId} WHERE id = ${FROM}`;
  console.log(`  external_ids ${exIds.length}件 / aliases ${aliases.length}件 / canonical_id set`);
  await sql`
    INSERT INTO canonical_audit_log (action, canonical_id, target_id, payload, actor, created_at)
    VALUES ('phase10e_merge', ${FROM}, ${toId},
            ${{ from: FROM, to: toId, residual_lineups: r1.length, residual_events: r2.length, externalIds: exIds.length, aliases: aliases.length }},
            'phase10e', NOW())
  `;
}

console.log("=== Preview ===");
let total = 0;
for (const s of STEPS) total += await preview(s);
console.log(`  合計 ${total} 試合`);
const [{ n: residual }] = await sql`SELECT COUNT(*)::int AS n FROM fixture_lineups WHERE player_id = ${FROM}`;
console.log(`  9001364 全 fixture_lineups: ${residual} 試合`);

if (APPLY_ALL) {
  console.log("\n=== APPLY ALL ===");
  for (const s of STEPS) await applyOne(s);
  await finalize(MERGE_TARGET);
}
