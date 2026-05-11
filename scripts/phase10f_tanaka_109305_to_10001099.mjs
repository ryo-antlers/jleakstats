/**
 * Phase 10f: 田中雄大 109305 の広島GK 20試合 を 10001099 へ
 *
 * 109305 (2002生 MF 横浜FM) に紐づく広島 2023-2026 GK 20試合は
 * 実は 10001099 (1995生 GK 広島) のもの。reassign。
 *
 * 109305 自体は 581815 と統合済 canonical で、横浜FM 試合は 581815 経由で見える。
 *
 * Usage:
 *   node scripts/phase10f_tanaka_109305_to_10001099.mjs          # preview
 *   node scripts/phase10f_tanaka_109305_to_10001099.mjs --apply
 */

import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
dotenv.config({ path: "/Users/ryo/Desktop/jleakstats/.env.local" });
const sql = neon(process.env.DATABASE_URL);

const APPLY = process.argv.includes("--apply");
const FROM = 109305;
const TO = 10001099;

const [{ id: HIROSHIMA_ID }] = await sql`SELECT id FROM teams_master WHERE name_ja='サンフレッチェ広島'`;
console.log(`広島 team_id = ${HIROSHIMA_ID}`);

const [lineups] = await sql`SELECT COUNT(*)::int AS n FROM fixture_lineups WHERE player_id=${FROM} AND team_id=${HIROSHIMA_ID}`;
const [events]  = await sql`SELECT COUNT(*)::int AS n FROM fixture_events  WHERE player_id=${FROM} AND team_id=${HIROSHIMA_ID}`;
const [stats]   = await sql`SELECT COUNT(*)::int AS n FROM fixture_player_stats WHERE player_id=${FROM} AND team_id=${HIROSHIMA_ID}`;
console.log(`preview: lineups=${lineups.n} events=${events.n} stats=${stats.n} (109305 → 10001099)`);

if (APPLY) {
  const r1 = await sql`UPDATE fixture_lineups SET player_id=${TO} WHERE player_id=${FROM} AND team_id=${HIROSHIMA_ID} RETURNING fixture_id`;
  const r2 = await sql`UPDATE fixture_events  SET player_id=${TO} WHERE player_id=${FROM} AND team_id=${HIROSHIMA_ID} RETURNING fixture_id`;
  const r3 = await sql`UPDATE fixture_player_stats SET player_id=${TO} WHERE player_id=${FROM} AND team_id=${HIROSHIMA_ID} RETURNING fixture_id`;
  console.log(`applied: lineups=${r1.length} events=${r2.length} stats=${r3.length}`);
  await sql`
    INSERT INTO canonical_audit_log (action, canonical_id, target_id, payload, actor, created_at)
    VALUES ('phase10f_reassign', null, ${TO},
            ${{ from: FROM, to: TO, team_id: HIROSHIMA_ID, lineups: r1.length, events: r2.length, stats: r3.length }},
            'phase10f', NOW())
  `;
}
