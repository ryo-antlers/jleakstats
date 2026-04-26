import sql from '@/lib/db'

function getBaseDelta(pts) {
  if (pts >= 12) return 2000
  if (pts >= 10) return 1200
  if (pts >= 8)  return 600
  if (pts >= 6)  return 300
  if (pts >= 4)  return 0
  if (pts >= 2)  return -300
  if (pts >= 0)  return -700
  return -1200
}

function getPriceMultiplier(price) {
  if (price <= 2000)  return 1.8
  if (price <= 4000)  return 1.4
  if (price <= 7000)  return 1.0
  if (price <= 10000) return 0.7
  return 0.5
}

export async function POST(request) {
  try {
    const { gameweek_id } = await request.json()

    const playerPoints = await sql`
      SELECT player_id, SUM(points) AS total_pts
      FROM fantasy_points
      WHERE gameweek_id = ${gameweek_id}
      GROUP BY player_id
    `
    if (playerPoints.length === 0) {
      return Response.json({ ok: false, error: 'このGWのポイントデータがありません' })
    }

    const sorted = [...playerPoints].sort((a, b) => Number(b.total_pts) - Number(a.total_pts))
    const mopBonus = new Map()
    if (sorted.length > 0) {
      const rank1Score = Number(sorted[0].total_pts)
      sorted.filter(p => Number(p.total_pts) === rank1Score)
            .forEach(p => mopBonus.set(p.player_id, 1000))
      const rest = sorted.filter(p => Number(p.total_pts) < rank1Score)
      let slots = 0; let prevScore = null
      for (const p of rest) {
        const score = Number(p.total_pts)
        if (score !== prevScore) { if (slots >= 4) break; slots++; prevScore = score }
        mopBonus.set(p.player_id, 500)
      }
    }

    const fixtureIds = await sql`SELECT fixture_id FROM fantasy_gameweek_fixtures WHERE gameweek_id = ${gameweek_id}`
    const fids = fixtureIds.map(r => r.fixture_id)
    const gwTeams = await sql`SELECT DISTINCT fps.team_id FROM fixture_player_stats fps WHERE fps.fixture_id = ANY(${fids})`
    const gwTeamSet = new Set(gwTeams.map(r => r.team_id))
    const playedMap = new Map(playerPoints.map(r => [r.player_id, Number(r.total_pts)]))

    const allPlayers = await sql`
      SELECT pm.id, pm.price, pm.team_id, pm.dob, pm.name_ja, pm.name_en, pm.position
      FROM players_master pm
      JOIN teams_master tm ON pm.team_id = tm.id
      WHERE tm.category = 'J1'
        AND pm.position IN ('GK', 'DF', 'MF', 'FW')
        AND pm.price IS NOT NULL
        AND pm.canonical_id IS NULL
        AND pm.is_active = true
    `

    const changes = []
    for (const player of allPlayers) {
      if (!gwTeamSet.has(player.team_id)) continue
      const currentPrice = Number(player.price)
      let delta
      if (!playedMap.has(player.id)) {
        delta = -800
      } else {
        const pts = playedMap.get(player.id)
        const base = getBaseDelta(pts)
        delta = base > 0 ? Math.round(base * getPriceMultiplier(currentPrice)) : base
      }
      if (mopBonus.has(player.id)) delta += mopBonus.get(player.id)

      let newPrice = Math.max(1000, currentPrice + delta)
      const pts = playedMap.get(player.id) ?? 0
      let overseas = false
      if (pts >= 18 && player.dob) {
        const age = new Date().getFullYear() - new Date(player.dob).getFullYear()
        if (age <= 23) { const bonus = Math.round(newPrice * 0.3); newPrice += bonus; overseas = true }
      }

      if (newPrice === currentPrice) continue
      changes.push({
        player_id: player.id,
        name: player.name_ja ?? player.name_en,
        position: player.position,
        pts,
        old_price: currentPrice,
        new_price: newPrice,
        delta: newPrice - currentPrice,
        mop: mopBonus.has(player.id),
        overseas,
      })
    }

    changes.sort((a, b) => b.delta - a.delta)
    return Response.json({ ok: true, total: changes.length, changes })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
