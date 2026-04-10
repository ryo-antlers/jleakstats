import sql from '@/lib/db'

export const revalidate = 300  // Next.js: 5分間キャッシュ

export async function GET() {
  const players = await sql`
    SELECT
      pm.id, pm.name_ja, pm.name_en, pm.position, pm.price, pm.team_id, pm.no, pm.dob,
      tm.abbr AS team_abbr, tm.color_primary AS team_color, tm.sort AS team_sort, tm.name_ja AS team_name_ja,
      st.group_name AS category,
      nf.opponent_abbr AS next_opponent,
      COALESCE(s.goals, 0) AS goals,
      COALESCE(s.assists, 0) AS assists,
      COALESCE(s.minutes, 0) AS minutes,
      ROUND(s.avg_rating::numeric, 2) AS avg_rating,
      rp.recent_points
    FROM players_master pm
    JOIN teams_master tm ON pm.team_id = tm.id
    LEFT JOIN (
      SELECT DISTINCT ON (team_id) team_id, group_name, rank
      FROM standings
      ORDER BY team_id, season DESC
    ) st ON st.team_id = tm.id
    LEFT JOIN (
      SELECT DISTINCT ON (team_id) team_id, opponent_abbr
      FROM (
        SELECT f.home_team_id AS team_id, ot.abbr AS opponent_abbr, f.date
        FROM fixtures f
        JOIN teams_master ot ON f.away_team_id = ot.id
        WHERE f.season = 2026 AND f.status NOT IN ('FT', 'AET', 'PEN')
        UNION ALL
        SELECT f.away_team_id AS team_id, ot.abbr AS opponent_abbr, f.date
        FROM fixtures f
        JOIN teams_master ot ON f.home_team_id = ot.id
        WHERE f.season = 2026 AND f.status NOT IN ('FT', 'AET', 'PEN')
      ) sub
      ORDER BY team_id, date ASC
    ) nf ON nf.team_id = tm.id
    LEFT JOIN (
      SELECT
        fps.player_id,
        SUM(fps.goals) AS goals,
        SUM(fps.assists) AS assists,
        SUM(CASE WHEN f.status = 'AET' THEN fps.minutes ELSE LEAST(fps.minutes, 90) END) AS minutes,
        AVG(NULLIF(fps.rating, 0)) AS avg_rating
      FROM fixture_player_stats fps
      JOIN fixtures f ON fps.fixture_id = f.id
      GROUP BY fps.player_id
    ) s ON s.player_id = pm.id
    LEFT JOIN (
      SELECT player_id, array_agg(points ORDER BY gw_number DESC) AS recent_points
      FROM (
        SELECT
          pm2.id AS player_id,
          fg.gw_number,
          COALESCE(SUM(fp.points), 0) AS points,
          ROW_NUMBER() OVER (PARTITION BY pm2.id ORDER BY fg.gw_number DESC) AS rn
        FROM players_master pm2
        JOIN (
          SELECT fg2.id, fg2.gw_number
          FROM fantasy_gameweeks fg2
          JOIN fantasy_gameweek_fixtures fgf2 ON fgf2.gameweek_id = fg2.id
          JOIN fixtures f2 ON f2.id = fgf2.fixture_id
          GROUP BY fg2.id, fg2.gw_number
          HAVING COUNT(*) = COUNT(CASE WHEN f2.status IN ('FT','AET','PEN') THEN 1 END)
            AND COUNT(*) > 0
        ) fg ON true
        JOIN fantasy_gameweek_fixtures fgf ON fgf.gameweek_id = fg.id
        JOIN fixtures f ON f.id = fgf.fixture_id
          AND (f.home_team_id = pm2.team_id OR f.away_team_id = pm2.team_id)
        LEFT JOIN fantasy_points fp ON fp.player_id = pm2.id AND fp.gameweek_id = fg.id
        WHERE pm2.position IN ('GK', 'DF', 'MF', 'FW')
        GROUP BY pm2.id, fg.id, fg.gw_number
      ) sub
      WHERE rn <= 5
      GROUP BY player_id
    ) rp ON rp.player_id = pm.id
    WHERE pm.position IN ('GK', 'DF', 'MF', 'FW')
      AND tm.category = 'J1'
      AND pm.canonical_id IS NULL
    ORDER BY pm.position, pm.price DESC, pm.name_ja
  `
  return Response.json({ players }, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' },
  })
}
