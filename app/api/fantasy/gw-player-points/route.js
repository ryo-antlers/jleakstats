import sql from '@/lib/db'

/**
 * GET /api/fantasy/gw-player-points?gw_number=10&clerk_user_id=xxx
 * 指定GW・ユーザーのスタメン＋各選手ポイントを返す
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const gw_number = searchParams.get('gw_number')
    const clerk_user_id = searchParams.get('clerk_user_id')
    if (!gw_number || !clerk_user_id) {
      return Response.json({ error: 'gw_number and clerk_user_id required' }, { status: 400 })
    }

    const [gw] = await sql`
      SELECT id FROM fantasy_gameweeks WHERE gw_number = ${gw_number}
    `
    if (!gw) return Response.json({ error: 'GW not found' }, { status: 404 })

    const players = await sql`
      SELECT
        pm.id AS player_id,
        pm.name_ja, pm.name_en, pm.position, pm.no,
        tm.color_primary AS team_color,
        COALESCE(fp.points, 0) AS points,
        fp.points IS NOT NULL AS has_points,
        (pm.id = fu.captain_player_id) AS is_captain
      FROM fantasy_gw_starters fgs
      JOIN players_master pm ON pm.id = fgs.player_id
      LEFT JOIN teams_master tm ON tm.id = pm.team_id
      LEFT JOIN (
        SELECT player_id, SUM(points) AS points
        FROM fantasy_points
        WHERE gameweek_id = ${gw.id}
        GROUP BY player_id
      ) fp ON fp.player_id = fgs.player_id
      LEFT JOIN fantasy_users fu ON fu.clerk_user_id = fgs.clerk_user_id
      WHERE fgs.gameweek_id = ${gw.id}
        AND fgs.clerk_user_id = ${clerk_user_id}
      ORDER BY
        CASE pm.position WHEN 'GK' THEN 1 WHEN 'DF' THEN 2 WHEN 'MF' THEN 3 WHEN 'FW' THEN 4 END
    `

    const anyConfirmed = players.some(p => p.has_points)
    return Response.json({ players, is_confirmed: anyConfirmed })
  } catch (err) {
    console.error('gw-player-points error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
