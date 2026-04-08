import sql from '@/lib/db'

// 公開API: 指定ユーザーのスタメンを取得（認証不要）
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')
  if (!userId) return Response.json({ error: 'user_id required' }, { status: 400 })

  const squad = await sql`
    SELECT
      fs.player_id, fs.is_starter, COALESCE(fs.sort_order, 0) AS sort_order,
      pm.name_ja, pm.name_en, pm.position, pm.no, pm.team_id,
      tm.abbr AS team_abbr, tm.color_primary AS team_color
    FROM fantasy_squads fs
    JOIN players_master pm ON fs.player_id = pm.id
    LEFT JOIN teams_master tm ON pm.team_id = tm.id
    WHERE fs.clerk_user_id = ${userId} AND fs.is_starter = true
    ORDER BY COALESCE(fs.sort_order, 0), pm.position
  `

  return Response.json({ squad }, {
    headers: { 'Cache-Control': 'public, max-age=60' },
  })
}
