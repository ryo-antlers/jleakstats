import { auth } from '@clerk/nextjs/server'
import sql from '@/lib/db'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const [lastGw] = await sql`
    SELECT fg.id, fg.gw_number
    FROM fantasy_gameweeks fg
    JOIN fantasy_gameweek_fixtures fgf ON fgf.gameweek_id = fg.id
    JOIN fixtures f ON f.id = fgf.fixture_id
    GROUP BY fg.id, fg.gw_number
    HAVING MAX(f.date) + INTERVAL '3 hours' <= NOW()
    ORDER BY fg.gw_number DESC
    LIMIT 1
  `
  if (!lastGw) return Response.json({ gw_number: null, gw_id: null, players: [] })

  // スナップショットがあればそちらを使い、なければ現在のis_starterで代替
  const snapshot = await sql`
    SELECT player_id FROM fantasy_gw_starters
    WHERE gameweek_id = ${lastGw.id} AND clerk_user_id = ${userId}
  `
  const useSnapshot = snapshot.length > 0
  const snapshotIds = new Set(snapshot.map(r => r.player_id))

  const players = await sql`
    SELECT
      pm.id AS player_id,
      pm.name_ja,
      pm.no,
      pm.position,
      tm.color_primary AS team_color,
      tm.name_ja AS team_name,
      fs.is_starter,
      COALESCE(fp.points, 0) AS points
    FROM fantasy_squads fs
    JOIN players_master pm ON pm.id = fs.player_id
    JOIN teams_master tm ON pm.team_id = tm.id
    LEFT JOIN fantasy_points fp ON fp.player_id = pm.id AND fp.gameweek_id = ${lastGw.id}
    WHERE fs.clerk_user_id = ${userId}
    ORDER BY
      fs.is_starter DESC,
      CASE pm.position WHEN 'GK' THEN 1 WHEN 'DF' THEN 2 WHEN 'MF' THEN 3 WHEN 'FW' THEN 4 END,
      COALESCE(fp.points, 0) DESC
  `

  // スナップショットがある場合は is_starter をスナップショットで上書き
  const result = players.map(p => ({
    ...p,
    is_starter: useSnapshot ? snapshotIds.has(p.player_id) : p.is_starter,
  }))

  return Response.json({ gw_number: lastGw.gw_number, gw_id: lastGw.id, players: result })
}
