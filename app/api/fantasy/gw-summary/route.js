import sql from '@/lib/db'

/**
 * GET /api/fantasy/gw-summary?gw_number=10
 * GWまとめページ用: ポイント・スタッツ各種TOP10
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const gw_number = searchParams.get('gw_number')
  if (!gw_number) return Response.json({ error: 'gw_number required' }, { status: 400 })

  const [gw] = await sql`SELECT id, gw_number FROM fantasy_gameweeks WHERE gw_number = ${gw_number}`
  if (!gw) return Response.json({ error: 'GW not found' }, { status: 404 })

  const fixtureIds = (await sql`
    SELECT fixture_id FROM fantasy_gameweek_fixtures WHERE gameweek_id = ${gw.id}
  `).map(r => r.fixture_id)

  if (fixtureIds.length === 0) return Response.json({ error: 'No fixtures' }, { status: 404 })

  // GW開始時点の価格スナップショット
  const priceSnap = await sql`
    SELECT player_id, price FROM fantasy_gw_player_prices WHERE gameweek_id = ${gw.id}
  `
  const priceMap = Object.fromEntries(priceSnap.map(p => [p.player_id, Number(p.price)]))

  // 確定ポイント(fantasy_points)があるか確認
  const [ptCheck] = await sql`SELECT COUNT(*) AS cnt FROM fantasy_points WHERE gameweek_id = ${gw.id}`
  const hasConfirmed = Number(ptCheck.cnt) > 0

  // 選手ポイントTOP10（確定 or fixture_player_statsから）
  let pointsTop10 = []
  if (hasConfirmed) {
    pointsTop10 = await sql`
      SELECT fp.player_id, SUM(fp.points) AS points,
        pm.name_ja, pm.name_en, pm.position, pm.team_id,
        tm.name_ja AS team_name, tm.color_primary AS team_color
      FROM fantasy_points fp
      JOIN players_master pm ON pm.id = fp.player_id
      LEFT JOIN teams_master tm ON tm.id = pm.team_id
      WHERE fp.gameweek_id = ${gw.id}
      GROUP BY fp.player_id, pm.name_ja, pm.name_en, pm.position, pm.team_id, tm.name_ja, tm.color_primary
      ORDER BY points DESC LIMIT 10
    `
  }

  // スタッツ集計（fixture_player_stats）
  const stats = fixtureIds.length > 0 ? await sql`
    SELECT
      COALESCE(pm2.canonical_id, fps.player_id) AS player_id,
      MAX(fps.rating) AS max_rating,
      SUM(fps.goals) AS goals,
      SUM(fps.assists) AS assists,
      SUM(fps.saves) AS saves,
      SUM(fps.tackles) AS tackles,
      SUM(fps.interceptions) AS interceptions,
      SUM(fps.blocks) AS blocks,
      SUM(fps.duels_won) AS duels_won,
      SUM(fps.passes_key) AS passes_key,
      SUM(fps.passes_total) AS passes_total,
      AVG(CASE WHEN fps.minutes >= 45 THEN fps.passes_accuracy END) AS passes_accuracy,
      SUM(fps.fouls_drawn) AS fouls_drawn,
      SUM(fps.minutes) AS minutes,
      AVG(CASE WHEN fps.minutes >= 45 THEN fps.rating END) AS avg_rating
    FROM fixture_player_stats fps
    LEFT JOIN players_master pm2 ON pm2.id = fps.player_id
    WHERE fps.fixture_id = ANY(${fixtureIds})
      AND fps.position IN ('G', 'D', 'M', 'F')
      AND fps.minutes > 0
    GROUP BY COALESCE(pm2.canonical_id, fps.player_id)
  ` : []

  // 選手情報マップ
  const playerIds = [...new Set(stats.map(s => s.player_id))]
  const players = playerIds.length > 0 ? await sql`
    SELECT pm.id, pm.name_ja, pm.name_en, pm.position, pm.team_id,
      tm.name_ja AS team_name, tm.color_primary AS team_color
    FROM players_master pm
    LEFT JOIN teams_master tm ON tm.id = pm.team_id
    WHERE pm.id = ANY(${playerIds})
  ` : []
  const playerMap = Object.fromEntries(players.map(p => [p.id, p]))

  function top10(arr, key, minVal = 0) {
    return arr
      .filter(s => Number(s[key] ?? 0) > minVal)
      .sort((a, b) => Number(b[key]) - Number(a[key]))
      .slice(0, 10)
      .map(s => ({ ...playerMap[s.player_id], ...s, price: priceMap[s.player_id] ?? null }))
  }

  // 3000万以下ポイントTOP10
  let budgetTop10 = []
  if (hasConfirmed) {
    budgetTop10 = await sql`
      SELECT fp.player_id, SUM(fp.points) AS points,
        pm.name_ja, pm.name_en, pm.position, pm.team_id,
        tm.name_ja AS team_name, tm.color_primary AS team_color,
        gpp.price
      FROM fantasy_points fp
      JOIN players_master pm ON pm.id = fp.player_id
      LEFT JOIN teams_master tm ON tm.id = pm.team_id
      LEFT JOIN fantasy_gw_player_prices gpp ON gpp.player_id = fp.player_id AND gpp.gameweek_id = ${gw.id}
      WHERE fp.gameweek_id = ${gw.id}
        AND COALESCE(gpp.price, pm.price) <= 30000000
      GROUP BY fp.player_id, pm.name_ja, pm.name_en, pm.position, pm.team_id, tm.name_ja, tm.color_primary, gpp.price
      ORDER BY points DESC LIMIT 10
    `
  }

  return Response.json({
    gw_number: Number(gw.gw_number),
    has_confirmed: hasConfirmed,
    rankings: {
      points: pointsTop10,
      budget_points: budgetTop10,
      rating: top10(stats, 'avg_rating'),
      goals: top10(stats, 'goals'),
      assists: top10(stats, 'assists'),
      saves: top10(stats, 'saves'),
      tackles: top10(stats, 'tackles'),
      interceptions: top10(stats, 'interceptions'),
      duels_won: top10(stats, 'duels_won'),
      passes_key: top10(stats, 'passes_key'),
      passes_accuracy: top10(stats.filter(s => Number(s.passes_total ?? 0) >= 20), 'passes_accuracy'),
      minutes: top10(stats, 'minutes'),
    },
  })
}
