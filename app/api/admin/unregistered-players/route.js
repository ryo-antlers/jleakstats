import sql from '@/lib/db'

export async function GET() {
  const rows = await sql`
    SELECT DISTINCT fps.player_id
    FROM fixture_player_stats fps
    WHERE NOT EXISTS (
      SELECT 1 FROM players_master pm WHERE pm.id = fps.player_id
    )
    ORDER BY fps.player_id
  `
  return Response.json({ players: rows })
}
