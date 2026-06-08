import sql from '@/lib/db'
import { fetchStandings, API_LEAGUES_ALL, apiLeagueToDbLeague } from '@/lib/api-football'
import { SEASON } from '@/lib/season'

// J1 + J2/J3百年構想 の順位表を API-Football から UPSERT
//   J1: 1グループ "J-League" (20チーム)
//   J2: 4グループ "East A" / "East B" / "West A" / "West B" (各10チーム)
//   group_name は API由来をそのまま保存
export async function GET(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // standings テーブル準備 (初回のみ)
    await sql`
      CREATE TABLE IF NOT EXISTS standings (
        team_id INTEGER,
        season INTEGER,
        group_name TEXT,
        rank INTEGER,
        prev_rank INTEGER,
        points INTEGER,
        goals_diff INTEGER,
        form TEXT,
        played INTEGER,
        win INTEGER,
        draw INTEGER,
        lose INTEGER,
        goals_for INTEGER,
        goals_against INTEGER,
        home_played INTEGER,
        home_win INTEGER,
        home_draw INTEGER,
        home_lose INTEGER,
        away_played INTEGER,
        away_win INTEGER,
        away_draw INTEGER,
        away_lose INTEGER,
        updated_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (team_id, season)
      )
    `
    await sql`ALTER TABLE standings ADD COLUMN IF NOT EXISTS prev_rank INTEGER`
    await sql`ALTER TABLE standings ADD COLUMN IF NOT EXISTS league_id INTEGER`

    const byLeague = {}
    let upserted = 0

    for (const apiLeague of API_LEAGUES_ALL) {
      const dbLeague = apiLeagueToDbLeague(apiLeague)
      const response = await fetchStandings(apiLeague)
      const groups = response[0]?.league?.standings ?? []
      let count = 0

      for (const group of groups) {
        for (const t of group) {
          await sql`
            INSERT INTO standings (
              team_id, season, league_id, group_name,
              rank, prev_rank, points, goals_diff, form,
              played, win, draw, lose, goals_for, goals_against,
              home_played, home_win, home_draw, home_lose,
              away_played, away_win, away_draw, away_lose,
              updated_at
            ) VALUES (
              ${t.team.id}, ${SEASON}, ${dbLeague}, ${t.group ?? null},
              ${t.rank}, ${t.rank}, ${t.points}, ${t.goalsDiff}, ${t.form},
              ${t.all.played}, ${t.all.win}, ${t.all.draw}, ${t.all.lose},
              ${t.all.goals.for}, ${t.all.goals.against},
              ${t.home.played}, ${t.home.win}, ${t.home.draw}, ${t.home.lose},
              ${t.away.played}, ${t.away.win}, ${t.away.draw}, ${t.away.lose},
              NOW()
            )
            ON CONFLICT (team_id, season) DO UPDATE SET
              league_id     = EXCLUDED.league_id,
              group_name    = EXCLUDED.group_name,
              prev_rank     = standings.rank,
              rank          = EXCLUDED.rank,
              points        = EXCLUDED.points,
              goals_diff    = EXCLUDED.goals_diff,
              form          = EXCLUDED.form,
              played        = EXCLUDED.played,
              win           = EXCLUDED.win,
              draw          = EXCLUDED.draw,
              lose          = EXCLUDED.lose,
              goals_for     = EXCLUDED.goals_for,
              goals_against = EXCLUDED.goals_against,
              home_played   = EXCLUDED.home_played,
              home_win      = EXCLUDED.home_win,
              home_draw     = EXCLUDED.home_draw,
              home_lose     = EXCLUDED.home_lose,
              away_played   = EXCLUDED.away_played,
              away_win      = EXCLUDED.away_win,
              away_draw     = EXCLUDED.away_draw,
              away_lose     = EXCLUDED.away_lose,
              updated_at    = NOW()
          `
          count++
        }
      }
      byLeague[apiLeague] = count
      upserted += count
    }

    return Response.json({ ok: true, upserted, by_league: byLeague })
  } catch (err) {
    console.error(err)
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
