/**
 * SFIX04 scraper: pull year-by-year career rows for canonical players
 * with a j-league 5-digit external_id, into player_career_summary.
 *
 * Usage:
 *   node scripts/scrape_sfix04_profiles.mjs                # full run
 *   node scripts/scrape_sfix04_profiles.mjs --limit 5      # dry-run on 5
 *   node scripts/scrape_sfix04_profiles.mjs --ids 45008,11468
 *   node scripts/scrape_sfix04_profiles.mjs --sleep 3000   # ms between fetches
 *   node scripts/scrape_sfix04_profiles.mjs --resume       # skip status='ok' from log
 *   node scripts/scrape_sfix04_profiles.mjs --dry          # parse + print, no DB write
 */

import { neon } from "@neondatabase/serverless";
import { load } from "cheerio";
import dotenv from "dotenv";
import { writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { setTimeout as sleep } from "timers/promises";

dotenv.config({ path: "/Users/ryo/Desktop/jleakstats/.env.local" });
const sql = neon(process.env.DATABASE_URL);

const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = args[i + 1];
  if (v && !v.startsWith("--")) return v;
  return true;
}

const LIMIT = arg("limit") ? Number(arg("limit")) : null;
const IDS = arg("ids") ? String(arg("ids")).split(",").map((s) => s.trim()).filter(Boolean) : null;
const SLEEP_MS = arg("sleep") ? Number(arg("sleep")) : 3000;
const RESUME = !!arg("resume");
const DRY = !!arg("dry");
const UA = "jleakstats.com/1.0 (+contact: jackcrispin13@gmail.com)";
const URL_BASE = "https://data.j-league.or.jp/SFIX04/";
const LOG_DIR = "/Users/ryo/Desktop/jleakstats/.claude/worktrees/hopeful-bartik-378605/logs";
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const FAIL_LOG = `${LOG_DIR}/sfix04_failures_${new Date().toISOString().slice(0, 10)}.jsonl`;
const RUN_LOG = `${LOG_DIR}/sfix04_run_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.log`;

function logRun(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(RUN_LOG, line + "\n");
}

function parseSeasonYear(season) {
  // "2001" -> 2001, "2026特別" -> 2026
  const m = String(season).match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

function parseIntOrNull(s) {
  if (s == null) return null;
  const trimmed = String(s).trim();
  if (trimmed === "" || trimmed === "-") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function parseSfix04Html(html) {
  const $ = load(html);
  const tables = $("table");
  if (tables.length < 2) return { rows: [], dob: null };

  // table[1] = year-by-year
  const yearTable = tables.eq(1);
  const rows = [];
  yearTable.find("tbody tr").each((_, tr) => {
    const cells = $(tr)
      .find("th,td")
      .map((_, c) => $(c).text().replace(/\s+/g, " ").trim())
      .get();
    // Expected columns: season, team, league, league_apps, league_goals,
    // cup_apps, cup_goals, cs_apps, cs_goals
    if (cells.length < 9) return;
    const [season, team, league, la, lg, ca, cg, sa, sg] = cells;
    if (!season || !team || !league) return;
    const seasonYear = parseSeasonYear(season);
    if (!seasonYear) return;
    rows.push({
      season,
      season_year: seasonYear,
      team_name_sfix: team,
      league,
      league_apps: parseIntOrNull(la),
      league_goals: parseIntOrNull(lg),
      cup_apps: parseIntOrNull(ca),
      cup_goals: parseIntOrNull(cg),
      cs_league_apps: parseIntOrNull(sa),
      cs_league_goals: parseIntOrNull(sg),
    });
  });

  // dob from profile section
  let dob = null;
  $("*").each((_, el) => {
    if (dob) return;
    const $el = $(el);
    if ($el.children().length === 0) {
      const t = $el.text().replace(/\s+/g, " ").trim();
      if (t === "生年月日") {
        const parentText = $el.parent().text().replace(/\s+/g, " ").trim();
        const m = parentText.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
        if (m) dob = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
      }
    }
  });

  return { rows, dob };
}

async function fetchSfix04(jl5) {
  const res = await fetch(`${URL_BASE}?player_id=${jl5}`, {
    headers: { "User-Agent": UA, Accept: "text/html" },
  });
  if (!res.ok) {
    return { ok: false, status: res.status, body: null };
  }
  return { ok: true, status: 200, body: await res.text() };
}

async function loadTargetCanonicals() {
  if (IDS) {
    return await sql`
      SELECT pm.id AS canonical_id, pm.name_ja, pm.dob,
             pei.external_id AS jl5
        FROM players_master pm
        JOIN player_external_ids pei
          ON pei.canonical_id = pm.id AND pei.source='j-league'
       WHERE pm.id = ANY(${IDS.map(Number)})
       ORDER BY pm.id
    `;
  }
  // base: every canonical with j-league 5-digit external_id
  let rows = await sql`
    SELECT pm.id AS canonical_id, pm.name_ja, pm.dob,
           pei.external_id AS jl5
      FROM players_master pm
      JOIN player_external_ids pei
        ON pei.canonical_id = pm.id AND pei.source='j-league'
     ORDER BY pm.id
  `;
  if (RESUME) {
    const done = await sql`
      SELECT canonical_id FROM sfix04_fetch_log WHERE status='ok'
    `;
    const doneSet = new Set(done.map((r) => r.canonical_id));
    rows = rows.filter((r) => !doneSet.has(r.canonical_id));
  }
  if (LIMIT) rows = rows.slice(0, LIMIT);
  return rows;
}

async function upsertCareer(canonicalId, careerRows) {
  if (!careerRows.length) return;
  await sql`DELETE FROM player_career_summary WHERE canonical_id=${canonicalId} AND source='sfix04'`;
  for (const r of careerRows) {
    await sql`
      INSERT INTO player_career_summary
        (canonical_id, season, season_year, team_name_sfix, team_id,
         league, league_apps, league_goals, cup_apps, cup_goals,
         cs_league_apps, cs_league_goals, source, fetched_at)
      VALUES
        (${canonicalId}, ${r.season}, ${r.season_year}, ${r.team_name_sfix}, NULL,
         ${r.league}, ${r.league_apps}, ${r.league_goals}, ${r.cup_apps}, ${r.cup_goals},
         ${r.cs_league_apps}, ${r.cs_league_goals}, 'sfix04', NOW())
      ON CONFLICT (canonical_id, season, team_name_sfix, league) DO UPDATE
        SET season_year     = EXCLUDED.season_year,
            league_apps     = EXCLUDED.league_apps,
            league_goals    = EXCLUDED.league_goals,
            cup_apps        = EXCLUDED.cup_apps,
            cup_goals       = EXCLUDED.cup_goals,
            cs_league_apps  = EXCLUDED.cs_league_apps,
            cs_league_goals = EXCLUDED.cs_league_goals,
            fetched_at      = NOW()
    `;
  }
}

async function maybeBackfillDob(canonicalId, currentDob, scrapedDob) {
  if (currentDob || !scrapedDob) return false;
  await sql`UPDATE players_master SET dob=${scrapedDob} WHERE id=${canonicalId} AND dob IS NULL`;
  return true;
}

async function logFetch(canonicalId, jl5, status, error) {
  await sql`
    INSERT INTO sfix04_fetch_log (canonical_id, jl5, status, error, fetched_at)
    VALUES (${canonicalId}, ${jl5}, ${status}, ${error || null}, NOW())
    ON CONFLICT (canonical_id) DO UPDATE
      SET jl5=EXCLUDED.jl5, status=EXCLUDED.status, error=EXCLUDED.error, fetched_at=NOW()
  `;
}

async function main() {
  logRun(`SFIX04 scraper start | sleep=${SLEEP_MS}ms | limit=${LIMIT ?? "none"} | ids=${IDS ?? "none"} | resume=${RESUME} | dry=${DRY}`);
  const targets = await loadTargetCanonicals();
  logRun(`Targets: ${targets.length}`);
  if (!targets.length) {
    logRun("No targets. Exit.");
    return;
  }

  let okCount = 0;
  let emptyCount = 0;
  let errCount = 0;
  let consecutiveErrors = 0;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const tag = `[${i + 1}/${targets.length}] cid=${t.canonical_id} jl5=${t.jl5} ${t.name_ja}`;
    try {
      const r = await fetchSfix04(t.jl5);
      if (!r.ok) {
        // Stop politely on overload-ish responses
        if (r.status === 429 || r.status === 503) {
          logRun(`${tag} HTTP ${r.status} -> sleep 5min then resume`);
          await sleep(5 * 60 * 1000);
          i--;
          continue;
        }
        consecutiveErrors++;
        errCount++;
        appendFileSync(FAIL_LOG, JSON.stringify({ canonical_id: t.canonical_id, jl5: t.jl5, http: r.status }) + "\n");
        await logFetch(t.canonical_id, t.jl5, "error", `HTTP ${r.status}`);
        logRun(`${tag} ERROR HTTP ${r.status}`);
        if (consecutiveErrors >= 5) {
          logRun(`5 consecutive errors -> abort. Re-run with --resume to continue.`);
          break;
        }
      } else {
        const { rows, dob } = parseSfix04Html(r.body);
        if (!rows.length) {
          emptyCount++;
          await logFetch(t.canonical_id, t.jl5, "empty", null);
          logRun(`${tag} empty (no career rows)`);
        } else {
          if (DRY) {
            console.log(`${tag} parsed ${rows.length} rows, dob=${dob}`);
            console.table(rows);
          } else {
            await upsertCareer(t.canonical_id, rows);
            const dobUpdated = await maybeBackfillDob(t.canonical_id, t.dob, dob);
            await logFetch(t.canonical_id, t.jl5, "ok", null);
            logRun(`${tag} ok rows=${rows.length}${dobUpdated ? " dob+" : ""}`);
          }
          okCount++;
          consecutiveErrors = 0;
        }
      }
    } catch (e) {
      consecutiveErrors++;
      errCount++;
      appendFileSync(FAIL_LOG, JSON.stringify({ canonical_id: t.canonical_id, jl5: t.jl5, err: String(e) }) + "\n");
      try {
        await logFetch(t.canonical_id, t.jl5, "error", String(e).slice(0, 500));
      } catch {}
      logRun(`${tag} EXCEPTION ${String(e).slice(0, 200)}`);
      if (consecutiveErrors >= 5) {
        logRun(`5 consecutive errors -> abort.`);
        break;
      }
    }

    if (i < targets.length - 1) {
      await sleep(SLEEP_MS);
    }
  }

  logRun(`Done. ok=${okCount} empty=${emptyCount} error=${errCount}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
