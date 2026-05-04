import sql from '@/lib/db'

export async function GET() {
  // fixture_player_stats: player_idがplayers_masterにない
  const fromStats = await sql`
    SELECT DISTINCT fps.player_id, null AS player_name_en, fps.team_id, tm.name_ja AS team_name, 'stats' AS source
    FROM fixture_player_stats fps
    LEFT JOIN teams_master tm ON tm.id = fps.team_id
    WHERE NOT EXISTS (
      SELECT 1 FROM players_master pm WHERE pm.id = fps.player_id
    )
  `

  // fixture_lineups: player_idがplayers_masterにない（IDなしは除外）
  const fromLineups = await sql`
    SELECT DISTINCT fl.player_id, fl.player_name_en, fl.team_id, tm.name_ja AS team_name, 'lineup' AS source
    FROM fixture_lineups fl
    LEFT JOIN teams_master tm ON tm.id = fl.team_id
    WHERE fl.player_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM players_master pm WHERE pm.id = fl.player_id
      )
  `

  return Response.json({ players: [...fromStats, ...fromLineups] })
}
