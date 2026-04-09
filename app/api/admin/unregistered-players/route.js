import sql from '@/lib/db'

export async function GET() {
  // fixture_player_stats: player_idがplayers_masterにない
  const fromStats = await sql`
    SELECT DISTINCT fps.player_id, null AS player_name_en, 'stats' AS source
    FROM fixture_player_stats fps
    WHERE NOT EXISTS (
      SELECT 1 FROM players_master pm WHERE pm.id = fps.player_id
    )
  `

  // fixture_lineups: player_idがplayers_masterにない（IDなしは除外）
  const fromLineups = await sql`
    SELECT DISTINCT fl.player_id, fl.player_name_en, 'lineup' AS source
    FROM fixture_lineups fl
    WHERE fl.player_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM players_master pm WHERE pm.id = fl.player_id
      )
  `

  return Response.json({ players: [...fromStats, ...fromLineups] })
}
