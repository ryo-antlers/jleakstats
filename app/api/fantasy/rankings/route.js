import sql from '@/lib/db'

export async function GET() {
  const users = await sql`
    SELECT
      fu.id,
      fu.clerk_user_id,
      fu.username,
      fu.team_name,
      fu.team_color,
      COALESCE(fu.total_points, 0) AS total_points,
      RANK() OVER (ORDER BY COALESCE(fu.total_points, 0) DESC) AS rank
    FROM fantasy_users fu
    ORDER BY total_points DESC, fu.team_name
    LIMIT 20
  `
  return Response.json({ rankings: users }, {
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=30' },
  })
}
