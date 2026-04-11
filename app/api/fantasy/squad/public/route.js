import sql from '@/lib/db'

// 公開API: 指定ユーザーのスタメンを取得（認証不要）
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')
  if (!userId) return Response.json({ error: 'user_id required' }, { status: 400 })

  const rows = await sql`
    SELECT
      fs.player_id, fs.is_starter, COALESCE(fs.sort_order, 0) AS sort_order,
      COALESCE(fs.pos_offset_x, 0) AS pos_offset_x,
      COALESCE(fs.pos_offset_y, 0) AS pos_offset_y,
      pm.name_ja, pm.name_en, pm.position, pm.no, pm.team_id,
      tm.abbr AS team_abbr, tm.color_primary AS team_color,
      (fs.player_id = fu.captain_player_id) AS is_captain
    FROM fantasy_squads fs
    JOIN players_master pm ON fs.player_id = pm.id
    LEFT JOIN teams_master tm ON pm.team_id = tm.id
    LEFT JOIN fantasy_users fu ON fu.clerk_user_id = fs.clerk_user_id
    WHERE fs.clerk_user_id = ${userId}
    ORDER BY fs.is_starter DESC, COALESCE(fs.sort_order, 0), pm.position
  `

  // 重複を排除（同一player_idが複数ある場合、is_starter=trueを優先）
  const seen = new Map()
  for (const p of rows) {
    const existing = seen.get(p.player_id)
    if (!existing || (p.is_starter && !existing.is_starter)) {
      seen.set(p.player_id, p)
    }
  }
  const deduped = [...seen.values()]
    .sort((a, b) => (b.is_starter ? 1 : 0) - (a.is_starter ? 1 : 0) || a.sort_order - b.sort_order)

  // スタメンが11人を超えている場合（データ不整合）、sort_order順に上位11人のみをスタメン扱いにする
  const startersSorted = deduped.filter(p => p.is_starter).sort((a, b) => a.sort_order - b.sort_order)
  const validStarterIds = new Set(startersSorted.slice(0, 11).map(p => p.player_id))
  const squad = deduped.map(p => ({
    ...p,
    is_starter: p.is_starter && validStarterIds.has(p.player_id),
  }))

  return Response.json({ squad }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
