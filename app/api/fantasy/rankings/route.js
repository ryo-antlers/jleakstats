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

export async function GET() {
  try {
    // テーブル保証（並列）
    await Promise.all([
      sql`CREATE TABLE IF NOT EXISTS fantasy_gw_user_points (
        id SERIAL PRIMARY KEY,
        gameweek_id INTEGER NOT NULL,
        clerk_user_id TEXT NOT NULL,
        gw_points INTEGER NOT NULL DEFAULT 0,
        UNIQUE (gameweek_id, clerk_user_id)
      )`,
      sql`CREATE TABLE IF NOT EXISTS fantasy_gw_starters (
        id SERIAL PRIMARY KEY,
        gameweek_id INTEGER NOT NULL REFERENCES fantasy_gameweeks(id),
        clerk_user_id TEXT NOT NULL,
        player_id INTEGER NOT NULL,
        UNIQUE (gameweek_id, clerk_user_id, player_id)
      )`,
    ])

    // フェーズ1: 独立クエリを並列実行
    const [recentGws, liveGwRows, users, squadValues] = await Promise.all([
      sql`
        SELECT id, gw_number FROM fantasy_gameweeks
        WHERE start_date::timestamptz < NOW()
        ORDER BY gw_number DESC LIMIT 5
      `,
      // ライブGW: 進行中 or 全試合終了済みだがfantasy_gw_user_pointsが未集計
      sql`
        SELECT fg.id, fg.gw_number,
          COUNT(*) = COUNT(CASE WHEN f.status IN ('FT', 'AET', 'PEN') THEN 1 END) AS all_done
        FROM fantasy_gameweeks fg
        JOIN fantasy_gameweek_fixtures fgf ON fgf.gameweek_id = fg.id
        JOIN fixtures f ON f.id = fgf.fixture_id
        WHERE fg.start_date::timestamptz < NOW()
        GROUP BY fg.id, fg.gw_number
        HAVING MIN(f.date) <= NOW()
          AND (
            COUNT(*) > COUNT(CASE WHEN f.status IN ('FT', 'AET', 'PEN') THEN 1 END)
            OR (
              NOT EXISTS (SELECT 1 FROM fantasy_gw_user_points WHERE gameweek_id = fg.id)
              AND NOT EXISTS (
                SELECT 1 FROM fantasy_gameweeks fg2
                JOIN fantasy_gw_user_points fgup ON fgup.gameweek_id = fg2.id
                WHERE fg2.gw_number > fg.gw_number
              )
            )
          )
        ORDER BY fg.gw_number DESC LIMIT 1
      `,
      sql`
        SELECT id, clerk_user_id, username, team_name, team_color, COALESCE(total_points, 0) AS total_points,
          COALESCE(budget, 0) AS budget
        FROM fantasy_users ORDER BY team_name
      `,
      sql`
        SELECT fs.clerk_user_id, COALESCE(SUM(pm.price), 0) AS squad_value
        FROM fantasy_squads fs
        JOIN players_master pm ON pm.id = fs.player_id
        GROUP BY fs.clerk_user_id
      `,
    ])

    const liveGw = liveGwRows[0] ?? null
    const liveGwAllDone = liveGw?.all_done === true
    const recentGwsAsc = [...recentGws].sort((a, b) => Number(a.gw_number) - Number(b.gw_number))
    const recentGwIds = recentGws.map(g => g.id)

    // フェーズ2: recentGwIds・liveGwに依存するクエリを並列実行
    const [gwUserPts, finishedFixtures, snapshotStarters, captains, confirmedPlayerPts] = await Promise.all([
      recentGwIds.length > 0
        ? sql`SELECT clerk_user_id, gameweek_id, gw_points FROM fantasy_gw_user_points WHERE gameweek_id = ANY(${recentGwIds})`
        : Promise.resolve([]),
      liveGw && !liveGwAllDone
        ? sql`
            SELECT f.id, f.home_team_id, f.away_team_id, f.home_score, f.away_score, f.status
            FROM fantasy_gameweek_fixtures fgf
            JOIN fixtures f ON f.id = fgf.fixture_id
            WHERE fgf.gameweek_id = ${liveGw.id} AND f.status IN ('FT', 'AET', 'PEN')
          `
        : Promise.resolve([]),
      liveGw
        ? sql`SELECT clerk_user_id, player_id FROM fantasy_gw_starters WHERE gameweek_id = ${liveGw.id}`
        : Promise.resolve([]),
      liveGw
        ? sql`SELECT clerk_user_id, captain_player_id FROM fantasy_users WHERE captain_player_id IS NOT NULL`
        : Promise.resolve([]),
      // 全試合終了済みの場合はfantasy_pointsから確定選手ポイントを取得
      liveGw && liveGwAllDone
        ? sql`SELECT player_id, SUM(points) AS points FROM fantasy_points WHERE gameweek_id = ${liveGw.id} GROUP BY player_id`
        : Promise.resolve([]),
    ])

    // ライブポイント計算
    const livePlayerPts = {}
    const liveUserPts = {}

    if (liveGw) {
      try {
        if (liveGwAllDone && confirmedPlayerPts.length > 0) {
          // 全試合終了済み & fantasy_points確定済み: 確定データを使う
          const confirmedMap = Object.fromEntries(confirmedPlayerPts.map(p => [p.player_id, Number(p.points)]))
          const allStarters = snapshotStarters.length > 0
            ? snapshotStarters
            : await sql`SELECT clerk_user_id, player_id FROM fantasy_squads WHERE is_starter = true`

          const startersByUser = {}
          for (const s of allStarters) {
            if (!startersByUser[s.clerk_user_id]) startersByUser[s.clerk_user_id] = new Set()
            startersByUser[s.clerk_user_id].add(Number(s.player_id))
            livePlayerPts[s.player_id] = confirmedMap[s.player_id] ?? 0
            liveUserPts[s.clerk_user_id] = (liveUserPts[s.clerk_user_id] ?? 0) + (confirmedMap[s.player_id] ?? 0)
          }
          for (const c of captains) {
            if (startersByUser[c.clerk_user_id]?.has(Number(c.captain_player_id))) {
              liveUserPts[c.clerk_user_id] = (liveUserPts[c.clerk_user_id] ?? 0) + (confirmedMap[c.captain_player_id] ?? 0)
            }
          }
        } else {
          // 進行中 or fantasy_points未集計: fixture_player_statsから暫定計算
          // finishedFixturesがフェーズ2で取得されていない場合は取得する
          const actualFinishedFixtures = liveGwAllDone
            ? await sql`
                SELECT f.id, f.home_team_id, f.away_team_id, f.home_score, f.away_score, f.status
                FROM fantasy_gameweek_fixtures fgf
                JOIN fixtures f ON f.id = fgf.fixture_id
                WHERE fgf.gameweek_id = ${liveGw.id} AND f.status IN ('FT', 'AET', 'PEN')
              `
            : finishedFixtures
          const finishedIds = actualFinishedFixtures.map(f => f.id)

          // フェーズ3: 選手スタッツ・PKミス・fallbackスタメンを並列取得
          const [missedPks, stats, fallbackStarters] = await Promise.all([
            finishedIds.length > 0
              ? sql`SELECT fixture_id, player_id FROM fixture_events WHERE fixture_id = ANY(${finishedIds}) AND type = 'Goal' AND detail = 'Missed Penalty'`
              : Promise.resolve([]),
            finishedIds.length > 0
              ? sql`
                  SELECT COALESCE(pm.canonical_id, fps.player_id) AS player_id,
                    fps.fixture_id, fps.position, fps.minutes, fps.rating,
                    fps.goals, fps.assists, fps.passes_key, fps.passes_total, fps.passes_accuracy,
                    fps.saves, fps.tackles, fps.interceptions, fps.blocks,
                    fps.duels_won, fps.fouls_drawn, fps.yellow_cards, fps.red_cards,
                    fps.team_id, fps.conceded
                  FROM fixture_player_stats fps
                  LEFT JOIN players_master pm ON pm.id = fps.player_id
                  WHERE fps.fixture_id = ANY(${finishedIds}) AND fps.position IN ('G', 'D', 'M', 'F')
                `
              : Promise.resolve([]),
            snapshotStarters.length === 0
              ? sql`SELECT clerk_user_id, player_id FROM fantasy_squads WHERE is_starter = true`
              : Promise.resolve(null),
          ])

          const allStarters = snapshotStarters.length > 0 ? snapshotStarters : (fallbackStarters ?? [])
          const missedPkSet = new Set(missedPks.map(e => `${e.fixture_id}_${e.player_id}`))
          const fixtureMap = Object.fromEntries(actualFinishedFixtures.map(f => [f.id, f]))

          for (const p of stats) {
            const fixture = fixtureMap[p.fixture_id]
            if (!fixture) continue
            const isHome = p.team_id === fixture.home_team_id
            const isAet = fixture.status === 'AET' || fixture.status === 'PEN'
            const myScore = isHome ? Number(fixture.home_score) : Number(fixture.away_score)
            const oppScore = isHome ? Number(fixture.away_score) : Number(fixture.home_score)
            const pts = calcPoints(p, Number(p.conceded) || oppScore, isAet ? false : myScore > oppScore, missedPkSet.has(`${p.fixture_id}_${p.player_id}`))
            livePlayerPts[p.player_id] = (livePlayerPts[p.player_id] ?? 0) + pts
          }

          const startersByUser = {}
          for (const s of allStarters) {
            if (!startersByUser[s.clerk_user_id]) startersByUser[s.clerk_user_id] = new Set()
            startersByUser[s.clerk_user_id].add(s.player_id)
            liveUserPts[s.clerk_user_id] = (liveUserPts[s.clerk_user_id] ?? 0) + (livePlayerPts[s.player_id] ?? 0)
          }
          for (const c of captains) {
            if (startersByUser[c.clerk_user_id]?.has(c.captain_player_id)) {
              liveUserPts[c.clerk_user_id] = (liveUserPts[c.clerk_user_id] ?? 0) + (livePlayerPts[c.captain_player_id] ?? 0)
            }
          }
        }
      } catch (liveErr) {
        console.error('rankings live calc error:', liveErr)
      }
    }

    const squadValueMap = Object.fromEntries(squadValues.map(s => [s.clerk_user_id, Number(s.squad_value)]))

    const result = users.map(u => {
      const gwPts = {}
      for (const gw of recentGwsAsc) {
        if (liveGw && Number(gw.id) === Number(liveGw.id)) {
          gwPts[gw.gw_number] = liveUserPts[u.clerk_user_id] ?? 0
        } else {
          const entry = gwUserPts.find(p => p.clerk_user_id === u.clerk_user_id && Number(p.gameweek_id) === Number(gw.id))
          gwPts[gw.gw_number] = entry ? Number(entry.gw_points) : null
        }
      }
      const liveExtra = liveGw ? (liveUserPts[u.clerk_user_id] ?? 0) : 0
      const squadVal = squadValueMap[u.clerk_user_id] ?? 0
      return {
        ...u,
        total_points: Number(u.total_points),
        total_with_live: Number(u.total_points) + liveExtra,
        gw_points: gwPts,
        total_assets: Number(u.budget) + squadVal,
      }
    })

    result.sort((a, b) => b.total_with_live - a.total_with_live || (a.team_name ?? '').localeCompare(b.team_name ?? ''))
    let rank = 1
    for (let i = 0; i < result.length; i++) {
      if (i > 0 && result[i].total_with_live < result[i - 1].total_with_live) rank = i + 1
      result[i].rank = rank
    }

    return Response.json({
      rankings: result,
      gw_columns: recentGwsAsc.map(g => Number(g.gw_number)),
      live_gw_number: liveGw ? Number(liveGw.gw_number) : null,
    }, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=30' },
    })
  } catch (err) {
    console.error('rankings error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
