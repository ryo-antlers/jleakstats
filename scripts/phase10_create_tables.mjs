import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
dotenv.config({ path: "/Users/ryo/Desktop/jleakstats/.env.local" });

const sql = neon(process.env.DATABASE_URL);

console.log("Creating player_career_summary ...");
await sql`
  CREATE TABLE IF NOT EXISTS player_career_summary (
    canonical_id    INT NOT NULL REFERENCES players_master(id) ON DELETE CASCADE,
    season          TEXT NOT NULL,
    season_year     INT  NOT NULL,
    team_name_sfix  TEXT NOT NULL,
    team_id         INT REFERENCES teams_master(id),
    league          TEXT NOT NULL,
    league_apps     INT,
    league_goals    INT,
    cup_apps        INT,
    cup_goals       INT,
    cs_league_apps  INT,
    cs_league_goals INT,
    source          TEXT NOT NULL DEFAULT 'sfix04',
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (canonical_id, season, team_name_sfix, league)
  )
`;

console.log("Creating indexes ...");
await sql`
  CREATE INDEX IF NOT EXISTS idx_player_career_summary_canonical
    ON player_career_summary (canonical_id, season_year DESC)
`;
await sql`
  CREATE INDEX IF NOT EXISTS idx_player_career_summary_team
    ON player_career_summary (team_id, season_year)
    WHERE team_id IS NOT NULL
`;

console.log("Creating sfix04_fetch_log ...");
await sql`
  CREATE TABLE IF NOT EXISTS sfix04_fetch_log (
    canonical_id INT PRIMARY KEY REFERENCES players_master(id) ON DELETE CASCADE,
    jl5          TEXT,
    status       TEXT NOT NULL,
    error        TEXT,
    fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

console.log("Done. Verifying ...");
const tables = await sql`
  SELECT tablename FROM pg_tables
  WHERE schemaname='public' AND tablename IN ('player_career_summary','sfix04_fetch_log')
  ORDER BY tablename
`;
console.table(tables);
