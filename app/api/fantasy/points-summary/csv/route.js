import sql from '@/lib/db'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const untilGw = parseInt(searchParams.get('until_gw') ?? '9')

  // GW番号リスト取得
  const gws = await sql`
    SELECT gw_number FROM fantasy_gameweeks
    WHERE gw_number <= ${untilGw}
    ORDER BY gw_number
  `
  const gwNumbers = gws.map(g => g.gw_number)

  const rows = await sql`
    SELECT
      pm.id AS player_id,
      pm.name_ja,
      pm.position,
      tm.abbr AS team_abbr,
      pm.price,
      COALESCE(SUM(fp.points), 0) AS total_points,
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
      AND pm.canonical_id IS NULL
      AND pm.is_active = true
    GROUP BY pm.id, pm.name_ja, pm.position, tm.abbr, pm.price
    ORDER BY total_points DESC
  `

  // CSVヘッダー
  const headers = ['player_id', 'name_ja', 'position', 'team', 'current_price', 'total_points', ...gwNumbers.map(n => `GW${n}`)]

  const csvRows = rows.map(r => {
    const gwMap = {}
    for (const g of (r.gw_breakdown ?? [])) gwMap[g.gw] = g.pts
    const gwCols = gwNumbers.map(n => gwMap[n] ?? '')
    return [r.player_id, r.name_ja, r.position, r.team_abbr, r.price, r.total_points, ...gwCols].join(',')
  })

  const csv = [headers.join(','), ...csvRows].join('\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="fantasy_points_gw1-${untilGw}.csv"`,
    }
  })
}
