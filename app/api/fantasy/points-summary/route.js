import sql from '@/lib/db'

// GET /api/fantasy/points-summary?until_gw=9
// 選手別GW1〜Nの総ポイント・GW別内訳を返す
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const untilGw = parseInt(searchParams.get('until_gw') ?? '9')

  const rows = await sql`
    SELECT
      pm.id AS player_id,
      pm.name_ja,
      pm.name_en,
      pm.position,
      pm.price,
      tm.abbr AS team_abbr,
      tm.name_ja AS team_name,
      COALESCE(SUM(fp.points), 0) AS total_points,
      COUNT(DISTINCT fp.gameweek_id) AS gw_count,
      json_agg(
        json_build_object('gw', fg.gw_number, 'pts', fp.points)
        ORDER BY fg.gw_number
      ) FILTER (WHERE fp.id IS NOT NULL) AS gw_breakdown
    FROM players_master pm
    JOIN teams_master tm ON pm.team_id = tm.id
    LEFT JOIN fantasy_points fp ON fp.player_id = pm.id
    LEFT JOIN fantasy_gameweeks fg ON fg.id = fp.gameweek_id AND fg.gw_number <= ${untilGw}
    WHERE tm.category = 'J1'
      AND pm.position IN ('GK', 'DF', 'MF', 'FW')
    GROUP BY pm.id, pm.name_ja, pm.name_en, pm.position, pm.price, tm.abbr, tm.name_ja
    ORDER BY total_points DESC
  `

  return Response.json({ players: rows })
}
