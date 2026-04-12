import sql from '@/lib/db'

const POS_MAP = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' }

function calcPoints(p, conceded, isWin, missedPk) {
  const pos = POS_MAP[p.position] ?? p.position
  const min = Number(p.minutes) || 0
  if (min === 0) return 0
  let pts = 0
  if (min >= 90) pts += 3
  else if (min >= 60) pts += 2
  else pts += 1
  if (isWin) pts += 2
  const goals = Number(p.goals) || 0
  if (goals > 0) pts += goals * (pos === 'GK' ? 6 : pos === 'DF' ? 4 : pos === 'MF' ? 4 : 6)
  const assists = Number(p.assists) || 0
  if (assists > 0) pts += assists * (pos === 'GK' ? 5 : 4)
  if (pos === 'DF' || pos === 'MF' || pos === 'FW') {
    const kp = Number(p.passes_key) || 0
    pts += kp >= 6 ? 3 : kp >= 4 ? 2 : kp >= 2 ? 1 : 0
  }
  if (min >= 90 && conceded === 0) {
    pts += pos === 'GK' ? 3 : pos === 'DF' ? 3 : pos === 'MF' ? 1 : 0
  }
  if (pos === 'GK' || pos === 'DF') {
    pts += conceded >= 4 ? -3 : conceded === 3 ? -2 : conceded === 2 ? -1 : 0
  }
  if (pos === 'GK') {
    const sv = Number(p.saves) || 0
    pts += sv >= 6 ? 3 : sv >= 4 ? 2 : sv >= 2 ? 1 : 0
  }
  const def = (Number(p.tackles) || 0) + (Number(p.interceptions) || 0) + (Number(p.blocks) || 0)
  if (def >= 4) pts += 3
  const duels = Number(p.duels_won) || 0
  pts += duels >= 8 ? 2 : duels >= 5 ? 1 : 0
  if ((Number(p.fouls_drawn) || 0) >= 4) pts += 1
  if ((Number(p.passes_total) || 0) >= 30 && (Number(p.passes_accuracy) || 0) >= 90) pts += 1
  if (Number(p.yellow_cards) > 0) pts -= 1
  if (Number(p.red_cards) > 0) pts -= 4
  if (missedPk) pts -= 3
  const rating = Number(p.rating) || 0
  if (rating >= 8.0) pts += 3
  else if (rating >= 7.5) pts += 2
  else if (rating >= 7.0) pts += 1
  return pts
}

/**
 * GET /api/fantasy/gw-player-points?gw_number=10&clerk_user_id=xxx
 * 指定GW・ユーザーのスタメン＋各選手ポイントを返す
 * 確定データがなければfixture_player_statsから暫定計算
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const gw_number = searchParams.get('gw_number')
    const clerk_user_id = searchParams.get('clerk_user_id')
    if (!gw_number || !clerk_user_id) {
      return Response.json({ error: 'gw_number and clerk_user_id required' }, { status: 400 })
    }

    const [gw] = await sql`SELECT id FROM fantasy_gameweeks WHERE gw_number = ${gw_number}`
    if (!gw) return Response.json({ error: 'GW not found' }, { status: 404 })

    // スナップショットから対象選手を取得
    const starterRows = await sql`
      SELECT
        pm.id AS player_id, pm.name_ja, pm.name_en, pm.position, pm.no,
        tm.color_primary AS team_color, pm.team_id,
        (pm.id = fu.captain_player_id) AS is_captain
      FROM fantasy_gw_starters fgs
      JOIN players_master pm ON pm.id = fgs.player_id
      LEFT JOIN teams_master tm ON tm.id = pm.team_id
      LEFT JOIN fantasy_users fu ON fu.clerk_user_id = fgs.clerk_user_id
      WHERE fgs.gameweek_id = ${gw.id}
        AND fgs.clerk_user_id = ${clerk_user_id}
      ORDER BY
        CASE pm.position WHEN 'GK' THEN 1 WHEN 'DF' THEN 2 WHEN 'MF' THEN 3 WHEN 'FW' THEN 4 END
    `

    // 確定ポイント（fantasy_points）を確認
    const confirmedPts = await sql`
      SELECT player_id, SUM(points) AS points
      FROM fantasy_points
      WHERE gameweek_id = ${gw.id}
      GROUP BY player_id
    `
    const confirmedMap = Object.fromEntries(confirmedPts.map(p => [p.player_id, Number(p.points)]))
    const isConfirmed = confirmedPts.length > 0

    // 確定データがある場合はそれを使う
    if (isConfirmed) {
      const players = starterRows.map(p => ({
        ...p,
        points: confirmedMap[p.player_id] ?? 0,
        has_points: true,
      }))
      return Response.json({ players, is_confirmed: true })
    }

    // 暫定計算：終了済み試合のfixture_player_statsから算出
    const finishedFixtures = await sql`
      SELECT f.id, f.home_team_id, f.away_team_id, f.home_score, f.away_score, f.status
      FROM fantasy_gameweek_fixtures fgf
      JOIN fixtures f ON f.id = fgf.fixture_id
      WHERE fgf.gameweek_id = ${gw.id}
        AND f.status IN ('FT', 'AET', 'PEN')
    `
    const finishedIds = finishedFixtures.map(f => f.id)

    const livePlayerPts = {}
    const playedPlayerIds = new Set()

    if (finishedIds.length > 0) {
      const [missedPks, stats] = await Promise.all([
        sql`
          SELECT fixture_id, player_id FROM fixture_events
          WHERE fixture_id = ANY(${finishedIds}) AND type = 'Goal' AND detail = 'Missed Penalty'
        `,
        sql`
          SELECT
            COALESCE(pm.canonical_id, fps.player_id) AS player_id,
            fps.fixture_id, fps.position, fps.minutes, fps.rating,
            fps.goals, fps.assists, fps.passes_key, fps.passes_total, fps.passes_accuracy,
            fps.saves, fps.tackles, fps.interceptions, fps.blocks,
            fps.duels_won, fps.fouls_drawn, fps.yellow_cards, fps.red_cards,
            fps.team_id, fps.conceded
          FROM fixture_player_stats fps
          LEFT JOIN players_master pm ON pm.id = fps.player_id
          WHERE fps.fixture_id = ANY(${finishedIds})
            AND fps.position IN ('G', 'D', 'M', 'F')
        `,
      ])

      const missedPkSet = new Set(missedPks.map(e => `${e.fixture_id}_${e.player_id}`))
      const fixtureMap = Object.fromEntries(finishedFixtures.map(f => [f.id, f]))

      for (const p of stats) {
        const fixture = fixtureMap[p.fixture_id]
        if (!fixture) continue
        const isHome = p.team_id === fixture.home_team_id
        const isAet = fixture.status === 'AET' || fixture.status === 'PEN'
        const myScore = isHome ? Number(fixture.home_score) : Number(fixture.away_score)
        const oppScore = isHome ? Number(fixture.away_score) : Number(fixture.home_score)
        const pts = calcPoints(p, Number(p.conceded) || Number(oppScore), isAet ? false : myScore > oppScore, missedPkSet.has(`${p.fixture_id}_${p.player_id}`))
        livePlayerPts[p.player_id] = (livePlayerPts[p.player_id] ?? 0) + pts
        playedPlayerIds.add(p.player_id)
      }
    }

    const players = starterRows.map(p => ({
      ...p,
      points: playedPlayerIds.has(p.player_id) ? (livePlayerPts[p.player_id] ?? 0) : null,
      has_points: playedPlayerIds.has(p.player_id),
    }))

    return Response.json({ players, is_confirmed: false })
  } catch (err) {
    console.error('gw-player-points error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
