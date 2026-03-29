import sql from '@/lib/db'
import { fetchStandings } from '@/lib/api-football'

export async function GET() {
  try {
    const response = await fetchStandings()
    const groups = response[0]?.league?.standings ?? []

    // standingsテーブルがなければ作成
    await sql`
      CREATE TABLE IF NOT EXISTS standings (
        team_id INTEGER,
        season INTEGER,
        group_name TEXT,
        rank INTEGER,
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

    let upserted = 0
    for (const group of groups) {
      const groupName = group[0]?.group === 'East' ? 'EAST' : 'WEST'
      for (const entry of group) {
        const t = entry
        await sql`
          INSERT INTO standings (
            team_id, season, group_name, rank, points, goals_diff, form,
            played, win, draw, lose, goals_for, goals_against,
            home_played, home_win, home_draw, home_lose,
            away_played, away_win, away_draw, away_lose,
            updated_at
          ) VALUES (
            ${t.team.id}, 2026, ${groupName},
            ${t.rank}, ${t.points}, ${t.goalsDiff}, ${t.form},
            ${t.all.played}, ${t.all.win}, ${t.all.draw}, ${t.all.lose},
            ${t.all.goals.for}, ${t.all.goals.against},
            ${t.home.played}, ${t.home.win}, ${t.home.draw}, ${t.home.lose},
            ${t.away.played}, ${t.away.win}, ${t.away.draw}, ${t.away.lose},
            NOW()
          )
          ON CONFLICT (team_id, season) DO UPDATE SET
            group_name = EXCLUDED.group_name,
            rank = EXCLUDED.rank,
            points = EXCLUDED.points,
            goals_diff = EXCLUDED.goals_diff,
            form = EXCLUDED.form,
            played = EXCLUDED.played,
            win = EXCLUDED.win,
            draw = EXCLUDED.draw,
            lose = EXCLUDED.lose,
            goals_for = EXCLUDED.goals_for,
            goals_against = EXCLUDED.goals_against,
            home_played = EXCLUDED.home_played,
            home_win = EXCLUDED.home_win,
            home_draw = EXCLUDED.home_draw,
            home_lose = EXCLUDED.home_lose,
            away_played = EXCLUDED.away_played,
            away_win = EXCLUDED.away_win,
            away_draw = EXCLUDED.away_draw,
            away_lose = EXCLUDED.away_lose,
            updated_at = NOW()
        `
        upserted++
      }
    }

    return Response.json({ ok: true, upserted })
  } catch (err) {
    console.error(err)
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
