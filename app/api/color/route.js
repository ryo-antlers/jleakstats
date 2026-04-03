import sql from '@/lib/db'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const id = parseInt(searchParams.get('id'))

  if (!id) return Response.json({ color: null })

  try {
    if (type === 'team') {
      const rows = await sql`SELECT color_primary FROM teams_master WHERE id = ${id}`
      return Response.json({ color: rows[0]?.color_primary ?? null })
    }
    if (type === 'fixture') {
      const rows = await sql`
        SELECT tm.color_primary FROM fixtures f
        JOIN teams_master tm ON tm.id = f.home_team_id
        WHERE f.id = ${id}
      `
      return Response.json({ color: rows[0]?.color_primary ?? null })
    }
    if (type === 'player') {
      const rows = await sql`
        SELECT tm.color_primary FROM fixture_player_stats fps
        JOIN teams_master tm ON tm.id = fps.team_id
        JOIN fixtures f ON f.id = fps.fixture_id
        WHERE fps.player_id = ${id} AND f.season = 2026
        ORDER BY f.date DESC LIMIT 1
      `
      return Response.json({ color: rows[0]?.color_primary ?? null })
    }
  } catch {
    // ignore
  }

  return Response.json({ color: null })
}
