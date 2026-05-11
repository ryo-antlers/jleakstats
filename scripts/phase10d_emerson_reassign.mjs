/**
 * Phase 10d: エメルソン系汚染整理
 *
 * 9002175 (湘南/dob無し canonical) に混在する 5 人のエメルソンを SFIX04 経歴に基づき分配。
 *
 * Steps:
 *  1. 1995 湘南       → 10000315 (Luiz Firmino)
 *  2. 2000 札幌       → 10000316 (Marcio Passos)
 *  3. 2001 川崎F      → 10000316
 *  4. 2001 東京V      → 10000317 (Orlando De Melo)
 *  5. 2001-2005 浦和  → 10000316
 *  6. 2003 清水       → 10000318 (Carvalho Da Silva)
 *  7. 2008 FC東京     → 10000319 (De Andrade Santos)
 *  8. 2010 湘南       → 10000319
 *  9. 残 → 10000316 へ merge (= 9002175 を 10000316 の alias に)
 *
 * Usage:
 *   node scripts/phase10d_emerson_reassign.mjs                       # preview only
 *   node scripts/phase10d_emerson_reassign.mjs --step N --apply      # 個別 step
 *   node scripts/phase10d_emerson_reassign.mjs --apply-all           # 全 step まとめ実行
 */

import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
dotenv.config({ path: "/Users/ryo/Desktop/jleakstats/.env.local" });
const sql = neon(process.env.DATABASE_URL);

const args = process.argv.slice(2);
const STEP = args.includes("--step") ? Number(args[args.indexOf("--step") + 1]) : null;
const APPLY = args.includes("--apply");
const APPLY_ALL = args.includes("--apply-all");

const FROM = 9002175;

async function teamId(name) {
  const r = await sql`SELECT id FROM teams_master WHERE name_ja = ${name}`;
  if (!r[0]) throw new Error(`team not found: ${name}`);
  return r[0].id;
}

const TEAMS = {
  shonan:   await teamId("湘南ベルマーレ"),
  sapporo:  await teamId("北海道コンサドーレ札幌"),
  kawasaki: await teamId("川崎フロンターレ"),
  urawa:    await teamId("浦和レッズ"),
  verdy:    await teamId("東京ヴェルディ"),
  shimizu:  await teamId("清水エスパルス"),
  fctokyo:  await teamId("FC東京"),
};

const STEPS = [
  { step: 1, to: 10000315, team: TEAMS.shonan,   teamName: "湘南",   seasons: [1995],                          desc: "1995 湘南 → Luiz Firmino" },
  { step: 2, to: 10000316, team: TEAMS.sapporo,  teamName: "札幌",   seasons: [2000],                          desc: "2000 札幌 → Marcio Passos" },
  { step: 3, to: 10000316, team: TEAMS.kawasaki, teamName: "川崎F",  seasons: [2001],                          desc: "2001 川崎F → Marcio Passos" },
  { step: 4, to: 10000317, team: TEAMS.verdy,    teamName: "東京V",  seasons: [2001],                          desc: "2001 東京V → Orlando De Melo" },
  { step: 5, to: 10000316, team: TEAMS.urawa,    teamName: "浦和",   seasons: [2001, 2002, 2003, 2004, 2005],  desc: "2001-2005 浦和 → Marcio Passos" },
  { step: 6, to: 10000318, team: TEAMS.shimizu,  teamName: "清水",   seasons: [2003],                          desc: "2003 清水 → Carvalho Da Silva" },
  { step: 7, to: 10000319, team: TEAMS.fctokyo,  teamName: "FC東京", seasons: [2008],                          desc: "2008 FC東京 → De Andrade Santos" },
  { step: 8, to: 10000319, team: TEAMS.shonan,   teamName: "湘南",   seasons: [2010],                          desc: "2010 湘南 → De Andrade Santos" },
];

async function preview(s) {
  const [lineups] = await sql`
    SELECT COUNT(*)::int AS n FROM fixture_lineups fl
    JOIN fixtures f ON fl.fixture_id = f.id
    WHERE fl.player_id = ${FROM}
      AND fl.team_id = ${s.team}
      AND f.season = ANY(${s.seasons})
  `;
  const [events] = await sql`
    SELECT COUNT(*)::int AS n FROM fixture_events fe
    JOIN fixtures f ON fe.fixture_id = f.id
    WHERE fe.player_id = ${FROM}
      AND fe.team_id = ${s.team}
      AND f.season = ANY(${s.seasons})
  `;
  const [stats] = await sql`
    SELECT COUNT(*)::int AS n FROM fixture_player_stats fps
    JOIN fixtures f ON fps.fixture_id = f.id
    WHERE fps.player_id = ${FROM}
      AND fps.team_id = ${s.team}
      AND f.season = ANY(${s.seasons})
  `;
  console.log(`  [Step ${s.step}] ${s.desc}: lineups=${lineups.n} events=${events.n} stats=${stats.n} → ${s.to}`);
  return { lineups: lineups.n, events: events.n, stats: stats.n };
}

async function applyOne(s) {
  console.log(`\n>>> APPLY Step ${s.step}: ${s.desc}`);
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
  console.log(`  lineups=${r1.length} events=${r2.length} stats=${r3.length}`);
  await sql`
    INSERT INTO canonical_audit_log (action, canonical_id, target_id, payload, actor, created_at)
    VALUES ('phase10d_reassign', null, ${s.to},
            ${{ step: s.step, desc: s.desc, from: FROM, to: s.to, team_id: s.team, seasons: s.seasons, lineups: r1.length, events: r2.length, stats: r3.length }},
            'phase10d', NOW())
  `;
}

async function finalize(toId) {
  console.log(`\n>>> FINALIZE: 9002175 残りを ${toId} に merge + alias 化`);
  const r1 = await sql`UPDATE fixture_lineups SET player_id = ${toId} WHERE player_id = ${FROM} RETURNING fixture_id`;
  const r2 = await sql`UPDATE fixture_events  SET player_id = ${toId} WHERE player_id = ${FROM} RETURNING fixture_id`;
  const r3 = await sql`UPDATE fixture_player_stats SET player_id = ${toId} WHERE player_id = ${FROM} RETURNING fixture_id`;
  console.log(`  residual lineups=${r1.length} events=${r2.length} stats=${r3.length}`);

  const exIds = await sql`SELECT source, external_id FROM player_external_ids WHERE canonical_id = ${FROM}`;
  for (const e of exIds) {
    const dup = await sql`SELECT 1 FROM player_external_ids WHERE canonical_id = ${toId} AND source = ${e.source} AND external_id = ${e.external_id}`;
    if (dup.length) {
      await sql`DELETE FROM player_external_ids WHERE canonical_id = ${FROM} AND source = ${e.source} AND external_id = ${e.external_id}`;
    } else {
      await sql`UPDATE player_external_ids SET canonical_id = ${toId} WHERE canonical_id = ${FROM} AND source = ${e.source} AND external_id = ${e.external_id}`;
    }
  }
  const aliases = await sql`SELECT * FROM player_aliases WHERE canonical_id = ${FROM}`;
  for (const a of aliases) {
    const dup = await sql`SELECT 1 FROM player_aliases WHERE canonical_id = ${toId} AND normalized = ${a.normalized}`;
    if (dup.length) {
      await sql`DELETE FROM player_aliases WHERE canonical_id = ${FROM} AND normalized = ${a.normalized}`;
    } else {
      await sql`UPDATE player_aliases SET canonical_id = ${toId} WHERE canonical_id = ${FROM} AND normalized = ${a.normalized}`;
    }
  }
  await sql`UPDATE players_master SET canonical_id = ${toId} WHERE id = ${FROM}`;
  console.log(`  external_ids ${exIds.length} 件処理 / aliases ${aliases.length} 件処理 / canonical_id set`);
  await sql`
    INSERT INTO canonical_audit_log (action, canonical_id, target_id, payload, actor, created_at)
    VALUES ('phase10d_merge', ${FROM}, ${toId},
            ${{ from: FROM, to: toId, residual_lineups: r1.length, residual_events: r2.length, externalIds: exIds.length, aliases: aliases.length }},
            'phase10d', NOW())
  `;
}

console.log("=== Preview ===");
let totalLineups = 0;
for (const s of STEPS) {
  const r = await preview(s);
  totalLineups += r.lineups;
}
console.log(`  合計 ${totalLineups} 試合 (9002175 全 261 試合と一致するはず)`);
const [{ n: residual }] = await sql`SELECT COUNT(*)::int AS n FROM fixture_lineups WHERE player_id = ${FROM}`;
console.log(`  現在の 9002175 全 fixture_lineups: ${residual} 試合 (Step 9 で 10000316 に merge + alias 化)`);

if (APPLY_ALL) {
  for (const s of STEPS) await applyOne(s);
  await finalize(10000316);
} else if (APPLY && STEP) {
  if (STEP === 9) await finalize(10000316);
  else {
    const s = STEPS.find(x => x.step === STEP);
    if (!s) throw new Error(`unknown step ${STEP}`);
    await applyOne(s);
  }
}
