import sql from '@/lib/db'

const POS_MAP = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' }

const BD_LABELS = {
  minutes_full:    '出場（フル）',
  minutes_60:      '出場（60分以上）',
  minutes_partial: '出場（59分未満）',
  win:             '勝利',
  goals:           'ゴール',
  assists:         'アシスト',
  key_passes:      'キーパス',
  clean_sheet:     'クリーンシート',
  conceded:        '失点',
  saves:           'セーブ',
  defensive:       '守備ボーナス',
  duels_won:       'デュエル勝利',
  fouls_drawn:     'ファウル獲得',
  pass_accuracy:   'パス精度',
  yellow:          'イエローカード',
  red:             'レッドカード',
  missed_pk:       'PKミス',
  rating_high:     'レーティング大ボーナス',
  rating_mid:      'レーティング中ボーナス',
  rating_low:      'レーティング小ボーナス',
}

function calcPoints(p, conceded, isWin, missedPk) {
  const pos = POS_MAP[p.position] ?? p.position
  const min = Number(p.minutes) || 0
  if (min === 0) return { pts: 0, breakdown: {} }
  let pts = 0
  const bd = {}
  if (min >= 90) { pts += 3; bd.minutes_full = 3 }
  else if (min >= 60) { pts += 2; bd.minutes_60 = 2 }
  else { pts += 1; bd.minutes_partial = 1 }
  if (isWin) { pts += 2; bd.win = 2 }
  const goals = Number(p.goals) || 0
  if (goals > 0) { const v = goals * (pos === 'GK' ? 6 : pos === 'DF' ? 4 : pos === 'MF' ? 4 : 6); pts += v; bd.goals = v }
  const assists = Number(p.assists) || 0
  if (assists > 0) { const v = assists * (pos === 'GK' ? 5 : 4); pts += v; bd.assists = v }
  if (pos === 'DF' || pos === 'MF' || pos === 'FW') {
    const kp = Number(p.passes_key) || 0
    const v = kp >= 6 ? 3 : kp >= 4 ? 2 : kp >= 2 ? 1 : 0
    if (v > 0) { pts += v; bd.key_passes = v }
  }
  if (min >= 90 && conceded === 0) {
    const v = pos === 'GK' ? 3 : pos === 'DF' ? 3 : pos === 'MF' ? 1 : 0
    if (v > 0) { pts += v; bd.clean_sheet = v }
  }
  if (pos === 'GK' || pos === 'DF') {
    const v = conceded >= 4 ? -3 : conceded === 3 ? -2 : conceded === 2 ? -1 : 0
    if (v < 0) { pts += v; bd.conceded = v }
  }
  if (pos === 'GK') {
    const sv = Number(p.saves) || 0
    const v = sv >= 6 ? 3 : sv >= 4 ? 2 : sv >= 2 ? 1 : 0
    if (v > 0) { pts += v; bd.saves = v }
  }
  const def = (Number(p.tackles) || 0) + (Number(p.interceptions) || 0) + (Number(p.blocks) || 0)
  if (def >= 4) { pts += 3; bd.defensive = 3 }
  const duels = Number(p.duels_won) || 0
  const dv = duels >= 8 ? 2 : duels >= 5 ? 1 : 0
  if (dv > 0) { pts += dv; bd.duels_won = dv }
  if ((Number(p.fouls_drawn) || 0) >= 4) { pts += 1; bd.fouls_drawn = 1 }
  if ((Number(p.passes_total) || 0) >= 30 && (Number(p.passes_accuracy) || 0) >= 90) { pts += 1; bd.pass_accuracy = 1 }
  if (Number(p.yellow_cards) > 0) { pts -= 1; bd.yellow = -1 }
  if (Number(p.red_cards) > 0) { pts -= 4; bd.red = -4 }
  if (missedPk) { pts -= 3; bd.missed_pk = -3 }
  const rating = Number(p.rating) || 0
  if (rating >= 8.0) { pts += 3; bd.rating_high = 3 }
  else if (rating >= 7.5) { pts += 2; bd.rating_mid = 2 }
  else if (rating >= 7.0) { pts += 1; bd.rating_low = 1 }
  return { pts, breakdown: bd }
}

/**
 * GET /api/fantasy/gw-player-points?gw_number=10&clerk_user_id=xxx
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

    const starterRows = await sql`
      SELECT
        pm.id AS player_id, pm.name_ja, pm.name_en, pm.position, pm.no,
        tm.color_primary AS team_color, pm.team_id,
        (pm.id = fu.captain_player_id) AS is_captain,
        COALESCE(fs.pos_offset_x, 0) AS pos_offset_x,
        COALESCE(fs.pos_offset_y, 0) AS pos_offset_y
      FROM fantasy_gw_starters fgs
      JOIN players_master pm ON pm.id = fgs.player_id
      LEFT JOIN teams_master tm ON tm.id = pm.team_id
      LEFT JOIN fantasy_users fu ON fu.clerk_user_id = fgs.clerk_user_id
      LEFT JOIN fantasy_squads fs ON fs.clerk_user_id = fgs.clerk_user_id AND fs.player_id = fgs.player_id
      WHERE fgs.gameweek_id = ${gw.id}
        AND fgs.clerk_user_id = ${clerk_user_id}
      ORDER BY
        CASE pm.position WHEN 'GK' THEN 1 WHEN 'DF' THEN 2 WHEN 'MF' THEN 3 WHEN 'FW' THEN 4 END
    `

    // 確定ポイント確認
    const confirmedPts = await sql`
      SELECT player_id, SUM(points) AS points
      FROM fantasy_points
      WHERE gameweek_id = ${gw.id}
      GROUP BY player_id
    `
    const confirmedMap = Object.fromEntries(confirmedPts.map(p => [p.player_id, Number(p.points)]))
    const isConfirmed = confirmedPts.length > 0

    if (isConfirmed) {
      // 確定: fantasy_pointsのポイント + fixture_player_statsから内訳を構築
      const fixtures = await sql`
        SELECT f.id, f.home_team_id, f.away_team_id, f.home_score, f.away_score, f.status, f.date,
          ht.name_ja AS home_name, at.name_ja AS away_name
        FROM fantasy_gameweek_fixtures fgf
        JOIN fixtures f ON f.id = fgf.fixture_id
        JOIN teams_master ht ON ht.id = f.home_team_id
        JOIN teams_master at ON at.id = f.away_team_id
        WHERE fgf.gameweek_id = ${gw.id} AND f.status IN ('FT', 'AET', 'PEN')
      `
      const fixtureIds = fixtures.map(f => f.id)
      const fixturesMap = {}

      if (fixtureIds.length > 0) {
        const [missedPks, stats] = await Promise.all([
          sql`SELECT fixture_id, player_id FROM fixture_events WHERE fixture_id = ANY(${fixtureIds}) AND type = 'Goal' AND detail = 'Missed Penalty'`,
          sql`
            SELECT COALESCE(pm.canonical_id, fps.player_id) AS player_id,
              fps.fixture_id, fps.position, fps.minutes, fps.rating,
              fps.goals, fps.assists, fps.passes_key, fps.passes_total, fps.passes_accuracy,
              fps.saves, fps.tackles, fps.interceptions, fps.blocks,
              fps.duels_won, fps.fouls_drawn, fps.yellow_cards, fps.red_cards,
              fps.team_id, fps.conceded
            FROM fixture_player_stats fps
            LEFT JOIN players_master pm ON pm.id = fps.player_id
            WHERE fps.fixture_id = ANY(${fixtureIds}) AND fps.position IN ('G', 'D', 'M', 'F')
          `,
        ])
        const missedPkSet = new Set(missedPks.map(e => `${e.fixture_id}_${e.player_id}`))
        const fixtureMap = Object.fromEntries(fixtures.map(f => [f.id, f]))
        const JST = 'Asia/Tokyo'
        for (const p of stats) {
          const fixture = fixtureMap[p.fixture_id]
          if (!fixture) continue
          const isHome = p.team_id === fixture.home_team_id
          const isAet = fixture.status === 'AET' || fixture.status === 'PEN'
          const myScore = isHome ? Number(fixture.home_score) : Number(fixture.away_score)
          const oppScore = isHome ? Number(fixture.away_score) : Number(fixture.home_score)
          const { pts, breakdown } = calcPoints(p, Number(p.conceded) || oppScore, isAet ? false : myScore > oppScore, missedPkSet.has(`${p.fixture_id}_${p.player_id}`))
          const opponent = isHome ? fixture.away_name : fixture.home_name
          const dateStr = new Intl.DateTimeFormat('ja-JP', { timeZone: JST, month: 'numeric', day: 'numeric' }).format(new Date(fixture.date))
          const events = Object.entries(breakdown).filter(([, v]) => v !== 0).map(([key, ptVal]) => ({ label: BD_LABELS[key] ?? key, pts: ptVal }))
          if (!fixturesMap[p.player_id]) fixturesMap[p.player_id] = []
          fixturesMap[p.player_id].push({ date: dateStr, opponent, points: pts, events })
        }
      }

      const players = starterRows.map(p => ({
        ...p,
        points: confirmedMap[p.player_id] ?? 0,
        has_points: true,
        live_fixtures: fixturesMap[p.player_id] ?? null,
      }))
      return Response.json({ players, is_confirmed: true })
    }

    // 暫定計算
    const finishedFixtures = await sql`
      SELECT f.id, f.home_team_id, f.away_team_id, f.home_score, f.away_score, f.status, f.date,
        ht.name_ja AS home_name, at.name_ja AS away_name
      FROM fantasy_gameweek_fixtures fgf
      JOIN fixtures f ON f.id = fgf.fixture_id
      JOIN teams_master ht ON ht.id = f.home_team_id
      JOIN teams_master at ON at.id = f.away_team_id
      WHERE fgf.gameweek_id = ${gw.id} AND f.status IN ('FT', 'AET', 'PEN')
    `
    const finishedIds = finishedFixtures.map(f => f.id)
    const livePlayerPts = {}
    const fixturesMap = {}
    const playedPlayerIds = new Set()

    if (finishedIds.length > 0) {
      const [missedPks, stats] = await Promise.all([
        sql`SELECT fixture_id, player_id FROM fixture_events WHERE fixture_id = ANY(${finishedIds}) AND type = 'Goal' AND detail = 'Missed Penalty'`,
        sql`
          SELECT COALESCE(pm.canonical_id, fps.player_id) AS player_id,
            fps.fixture_id, fps.position, fps.minutes, fps.rating,
            fps.goals, fps.assists, fps.passes_key, fps.passes_total, fps.passes_accuracy,
            fps.saves, fps.tackles, fps.interceptions, fps.blocks,
            fps.duels_won, fps.fouls_drawn, fps.yellow_cards, fps.red_cards,
            fps.team_id, fps.conceded
          FROM fixture_player_stats fps
          LEFT JOIN players_master pm ON pm.id = fps.player_id
          WHERE fps.fixture_id = ANY(${finishedIds}) AND fps.position IN ('G', 'D', 'M', 'F')
        `,
      ])
      const missedPkSet = new Set(missedPks.map(e => `${e.fixture_id}_${e.player_id}`))
      const fixtureMap = Object.fromEntries(finishedFixtures.map(f => [f.id, f]))
      const JST = 'Asia/Tokyo'

      for (const p of stats) {
        const fixture = fixtureMap[p.fixture_id]
        if (!fixture) continue
        const isHome = p.team_id === fixture.home_team_id
        const isAet = fixture.status === 'AET' || fixture.status === 'PEN'
        const myScore = isHome ? Number(fixture.home_score) : Number(fixture.away_score)
        const oppScore = isHome ? Number(fixture.away_score) : Number(fixture.home_score)
        const { pts, breakdown } = calcPoints(p, Number(p.conceded) || oppScore, isAet ? false : myScore > oppScore, missedPkSet.has(`${p.fixture_id}_${p.player_id}`))
        livePlayerPts[p.player_id] = (livePlayerPts[p.player_id] ?? 0) + pts
        playedPlayerIds.add(p.player_id)

        const opponent = isHome ? fixture.away_name : fixture.home_name
        const dateStr = new Intl.DateTimeFormat('ja-JP', { timeZone: JST, month: 'numeric', day: 'numeric' }).format(new Date(fixture.date))
        const events = Object.entries(breakdown).filter(([, v]) => v !== 0).map(([key, ptVal]) => ({ label: BD_LABELS[key] ?? key, pts: ptVal }))
        if (!fixturesMap[p.player_id]) fixturesMap[p.player_id] = []
        fixturesMap[p.player_id].push({ date: dateStr, opponent, points: pts, events })
      }
    }

    const players = starterRows.map(p => ({
      ...p,
      points: playedPlayerIds.has(p.player_id) ? (livePlayerPts[p.player_id] ?? 0) : null,
      has_points: playedPlayerIds.has(p.player_id),
      live_fixtures: fixturesMap[p.player_id] ?? null,
    }))

    return Response.json({ players, is_confirmed: false })
  } catch (err) {
    console.error('gw-player-points error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
