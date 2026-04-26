import sql from '@/lib/db'

// GWポイント → ベース価格変動
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

// 上昇時のみ価格帯補正
function getPriceMultiplier(price) {
  if (price <= 2000)  return 1.8
  if (price <= 4000)  return 1.4
  if (price <= 7000)  return 1.0
  if (price <= 10000) return 0.7
  return 0.5
}

// POST /api/fantasy/update-prices  body: { gameweek_id }
export async function POST(request) {
  try {
    const { gameweek_id } = await request.json()

    // そのGWの各選手の合計ポイント
    const playerPoints = await sql`
      SELECT player_id, SUM(points) AS total_pts
      FROM fantasy_points
      WHERE gameweek_id = ${gameweek_id}
      GROUP BY player_id
    `

    if (playerPoints.length === 0) {
      return Response.json({ ok: false, error: 'このGWのポイントデータがありません。先にcalc-pointsを実行してください。' }, { status: 400 })
    }

    // Most Outstanding Player: 1位+1000万、2〜5位+500万（同点全員）
    const sorted = [...playerPoints].sort((a, b) => Number(b.total_pts) - Number(a.total_pts))
    const mopBonus = new Map()
    if (sorted.length > 0) {
      const rank1Score = Number(sorted[0].total_pts)
      sorted.filter(p => Number(p.total_pts) === rank1Score)
            .forEach(p => mopBonus.set(p.player_id, 1000))

      // 1位を除いた残りから最大4スロット分（同点は同スロット扱い）
      const rest = sorted.filter(p => Number(p.total_pts) < rank1Score)
      let slots = 0
      let prevScore = null
      for (const p of rest) {
        const score = Number(p.total_pts)
        if (score !== prevScore) {
          if (slots >= 4) break
          slots++
          prevScore = score
        }
        mopBonus.set(p.player_id, 500)
      }
    }

    // GW対象fixtureのチームセット
    const fixtureIds = await sql`
      SELECT fixture_id FROM fantasy_gameweek_fixtures WHERE gameweek_id = ${gameweek_id}
    `
    const fids = fixtureIds.map(r => r.fixture_id)

    const gwTeams = await sql`
      SELECT DISTINCT fps.team_id
      FROM fixture_player_stats fps
      WHERE fps.fixture_id = ANY(${fids})
    `
    const gwTeamSet = new Set(gwTeams.map(r => r.team_id))

    const playedMap = new Map(playerPoints.map(r => [r.player_id, Number(r.total_pts)]))

    // J1全選手（dobも取得）
    const allPlayers = await sql`
      SELECT pm.id, pm.price, pm.team_id, pm.dob
      FROM players_master pm
      JOIN teams_master tm ON pm.team_id = tm.id
      WHERE tm.category = 'J1'
        AND pm.position IN ('GK', 'DF', 'MF', 'FW')
        AND pm.price IS NOT NULL
        AND pm.canonical_id IS NULL
    `

    const updateIds = []
    const updatePrices = []
    let overseasEvent = null
    for (const player of allPlayers) {
      if (!gwTeamSet.has(player.team_id)) continue

      const currentPrice = Number(player.price)
      let delta

      if (!playedMap.has(player.id)) {
        // 不出場 -800万
        delta = -800
      } else {
        const pts = playedMap.get(player.id)
        const base = getBaseDelta(pts)
        delta = base > 0
          ? Math.round(base * getPriceMultiplier(currentPrice))
          : base
      }

      // MOP ボーナス加算
      if (mopBonus.has(player.id)) {
        delta += mopBonus.get(player.id)
      }

      let newPrice = Math.max(1000, currentPrice + delta)
      let thisPlayerOverseas = false

      // 「海外に見つかる」: 23歳以下 かつ 20pt以上 → 通常計算後の価格にさらに30%加算
      const pts = playedMap.get(player.id) ?? 0
      if (pts >= 18 && player.dob) {
        const age = new Date().getFullYear() - new Date(player.dob).getFullYear()
        if (age <= 23) {
          const bonus = Math.round(newPrice * 0.3)
          newPrice = newPrice + bonus
          overseasEvent = { player_id: player.id, pts, bonus }
          thisPlayerOverseas = true
        }
      }

      if (delta === 0 && !thisPlayerOverseas) continue

      if (newPrice !== currentPrice) {
        updateIds.push(player.id)
        updatePrices.push(newPrice)
      }
    }

    // バルクUPDATE (unnest) で1リクエストにまとめる
    if (updateIds.length > 0) {
      await sql`
        UPDATE players_master pm
        SET price = u.new_price
        FROM unnest(${updateIds}::int[], ${updatePrices}::int[]) AS u(id, new_price)
        WHERE pm.id = u.id
      `
    }
    const updated = updateIds.length

    return Response.json({ ok: true, gameweek_id, updated, overseas_event: overseasEvent })
  } catch (err) {
    console.error('update-prices error:', err)
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
