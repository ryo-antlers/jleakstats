import sql from '@/lib/db'

// GWポイントに基づく価格変動幅
function getPriceDelta(pts) {
  if (pts >= 12) return 1000
  if (pts >= 10) return 700
  if (pts >= 8)  return 400
  if (pts >= 6)  return 200
  if (pts >= 4)  return 0
  if (pts >= 2)  return -200
  if (pts >= 0)  return -400
  if (pts >= -2) return -700
  return -1000
}

// POST /api/fantasy/update-prices  body: { gameweek_id }
export async function POST(request) {
  try {
    const { gameweek_id } = await request.json()

    // そのGWの各選手の合計ポイント（同GW内に複数試合あれば合算）
    const playerPoints = await sql`
      SELECT player_id, SUM(points) AS total_pts
      FROM fantasy_points
      WHERE gameweek_id = ${gameweek_id}
      GROUP BY player_id
    `

    if (playerPoints.length === 0) {
      return Response.json({ ok: false, error: 'このGWのポイントデータがありません。先にcalc-pointsを実行してください。' }, { status: 400 })
    }

    // GW対象fixtureに出場した選手IDセット（不出場 = -500万）
    const fixtureIds = await sql`
      SELECT fixture_id FROM fantasy_gameweek_fixtures WHERE gameweek_id = ${gameweek_id}
    `
    const fids = fixtureIds.map(r => r.fixture_id)

    const playedSet = new Set(playerPoints.map(r => r.player_id))

    // players_masterの全J1選手（GW対象選手かどうか判定のため）
    const allPlayers = await sql`
      SELECT pm.id, pm.price, pm.team_id
      FROM players_master pm
      JOIN teams_master tm ON pm.team_id = tm.id
      WHERE tm.category = 'J1'
        AND pm.position IN ('GK', 'DF', 'MF', 'FW')
        AND pm.price IS NOT NULL
    `

    // GWに関係するチームのfixture
    const gwTeams = await sql`
      SELECT DISTINCT fps.team_id
      FROM fixture_player_stats fps
      WHERE fps.fixture_id = ANY(${fids})
    `
    const gwTeamSet = new Set(gwTeams.map(r => r.team_id))

    let updated = 0
    for (const player of allPlayers) {
      // GW対象チームに所属していない選手はスキップ
      if (!gwTeamSet.has(player.team_id)) continue

      const rec = playerPoints.find(r => r.player_id === player.id)
      let delta

      if (!rec) {
        // 対象チーム所属だが出場0分 → -500万
        delta = -500
      } else {
        delta = getPriceDelta(Number(rec.total_pts))
      }

      if (delta === 0) continue

      const currentPrice = Number(player.price)
      const newPrice = Math.max(1000, currentPrice + delta)

      if (newPrice !== currentPrice) {
        await sql`
          UPDATE players_master SET price = ${newPrice} WHERE id = ${player.id}
        `
        updated++
      }
    }

    return Response.json({ ok: true, gameweek_id, updated })
  } catch (err) {
    console.error('update-prices error:', err)
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
