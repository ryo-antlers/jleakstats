import sql from '@/lib/db'

const POS_MAP = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' }

function authCheck(request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const auth = request.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

function calcPoints(p, conceded, isWin, missedPk) {
  const pos = POS_MAP[p.position] ?? p.position
  const min = Number(p.minutes) || 0
  if (min === 0) return { pts: 0, breakdown: {} }
  let pts = 0; const bd = {}
  if (min >= 90) { pts += 3; bd.minutes_full = 3 }
  else if (min >= 60) { pts += 2; bd.minutes_60 = 2 }
  else { pts += 1; bd.minutes_partial = 1 }
  if (isWin) { pts += 2; bd.win = 2 }
  const goals = Number(p.goals) || 0
  if (goals > 0) { const v = goals * (pos === 'GK' ? 6 : pos === 'DF' ? 4 : pos === 'MF' ? 4 : 6); pts += v; bd.goals = v }
  const assists = Number(p.assists) || 0
  if (assists > 0) { const v = assists * (pos === 'GK' ? 5 : 4); pts += v; bd.assists = v }
  if (pos === 'DF' || pos === 'MF' || pos === 'FW') { const kp = Number(p.passes_key) || 0; const v = kp >= 6 ? 3 : kp >= 4 ? 2 : kp >= 2 ? 1 : 0; if (v > 0) { pts += v; bd[`key_passes`] = v } }
  if (min >= 90 && conceded === 0) { const v = pos === 'GK' ? 3 : pos === 'DF' ? 3 : pos === 'MF' ? 1 : 0; if (v > 0) { pts += v; bd.clean_sheet = v } }
  if (pos === 'GK' || pos === 'DF') { const v = conceded >= 4 ? -3 : conceded === 3 ? -2 : conceded === 2 ? -1 : 0; if (v < 0) { pts += v; bd.conceded = v } }
  if (pos === 'GK') { const sv = Number(p.saves) || 0; const v = sv >= 6 ? 3 : sv >= 4 ? 2 : sv >= 2 ? 1 : 0; if (v > 0) { pts += v; bd.saves = v } }
  const def = (Number(p.tackles) || 0) + (Number(p.interceptions) || 0) + (Number(p.blocks) || 0)
  if (def >= 4) { pts += 3; bd.defensive = 3 }
  const duels = Number(p.duels_won) || 0
  if (duels >= 8) { pts += 2; bd.duels_won = 2 }
  else if (duels >= 5) { pts += 1; bd.duels_won = 1 }
  const fouls = Number(p.fouls_drawn) || 0
  if (fouls >= 4) { pts += 1; bd.fouls_drawn = 1 }
  const passAcc = Number(p.passes_accuracy) || 0
  const passTotal = Number(p.passes_total) || 0
  if (passTotal >= 30 && passAcc >= 90) { pts += 1; bd.pass_accuracy = 1 }
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
 * GET /api/fantasy/auto-process
 * GitHub Actions から毎時実行。選手ポイント計算のみ自動化。
 * ユーザーポイント付与・移籍金変動は管理画面から手動実行。
 */
export async function GET(request) {
  if (!authCheck(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const log = []
  try {
    await sql`CREATE TABLE IF NOT EXISTS fantasy_gw_processed (
      gameweek_id INTEGER PRIMARY KEY,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      steps JSONB
    )`

    await sql`
      CREATE TABLE IF NOT EXISTS fantasy_gw_starters (
        id SERIAL PRIMARY KEY,
        gameweek_id INTEGER NOT NULL REFERENCES fantasy_gameweeks(id),
        clerk_user_id TEXT NOT NULL,
        player_id INTEGER NOT NULL,
        UNIQUE (gameweek_id, clerk_user_id, player_id)
      )
    `

    // 締め切り済みでまだSnapshotがないGWを自動取得
    const gwsNeedingSnapshot = await sql`
      SELECT fg.id, fg.gw_number
      FROM fantasy_gameweeks fg
      WHERE fg.deadline < NOW()
        AND NOT EXISTS (
          SELECT 1 FROM fantasy_gw_starters fgs WHERE fgs.gameweek_id = fg.id
        )
      ORDER BY fg.gw_number
    `
    for (const gw of gwsNeedingSnapshot) {
      const starters = await sql`
        SELECT clerk_user_id, player_id FROM fantasy_squads WHERE is_starter = true
      `
      for (const s of starters) {
        await sql`
          INSERT INTO fantasy_gw_starters (gameweek_id, clerk_user_id, player_id)
          VALUES (${gw.id}, ${s.clerk_user_id}, ${s.player_id})
          ON CONFLICT DO NOTHING
        `
      }
      log.push({ snapshot: `GW${gw.gw_number}`, count: starters.length })
    }

    // GW内の全試合が終了済みのGWを検索（6時間待ちなし）
    const pendingGws = await sql`
      SELECT fg.id, fg.gw_number
      FROM fantasy_gameweeks fg
      JOIN fantasy_gameweek_fixtures fgf ON fgf.gameweek_id = fg.id
      JOIN fixtures f ON f.id = fgf.fixture_id
      GROUP BY fg.id, fg.gw_number
      HAVING COUNT(*) = COUNT(CASE WHEN f.status IN ('FT', 'AET', 'PEN') THEN 1 END)
        AND COUNT(*) > 0
      ORDER BY fg.gw_number
    `

    for (const gw of pendingGws) {
      const [done] = await sql`SELECT steps FROM fantasy_gw_processed WHERE gameweek_id = ${gw.id}`
      if (done?.steps?.calc_points) continue // 選手ポイント計算済み

      const fixtures = await sql`
        SELECT f.id, f.home_team_id, f.away_team_id, f.home_score, f.away_score, f.status
        FROM fantasy_gameweek_fixtures fgf
        JOIN fixtures f ON f.id = fgf.fixture_id
        WHERE fgf.gameweek_id = ${gw.id} AND f.status IN ('FT', 'AET', 'PEN')
      `
      const fixtureIds = fixtures.map(f => f.id)
      const missedPks = await sql`
        SELECT fixture_id, player_id FROM fixture_events
        WHERE fixture_id = ANY(${fixtureIds}) AND type = 'Goal' AND detail = 'Missed Penalty'
      `
      const missedPkSet = new Set(missedPks.map(e => `${e.fixture_id}_${e.player_id}`))

      await sql`DELETE FROM fantasy_points WHERE gameweek_id = ${gw.id}`
      let count = 0
      for (const f of fixtures) {
        const isAet = f.status === 'AET' || f.status === 'PEN'
        const players = await sql`
          SELECT
            COALESCE(pm.canonical_id, fps.player_id) AS player_id,
            fps.position, fps.minutes, fps.rating, fps.goals, fps.assists,
            fps.passes_key, fps.passes_total, fps.passes_accuracy, fps.saves, fps.tackles, fps.interceptions, fps.blocks,
            fps.duels_won, fps.fouls_drawn, fps.yellow_cards, fps.red_cards, fps.team_id, fps.conceded
          FROM fixture_player_stats fps
          LEFT JOIN players_master pm ON pm.id = fps.player_id
          WHERE fps.fixture_id = ${f.id} AND fps.position IN ('G', 'D', 'M', 'F')
        `
        for (const p of players) {
          const isHome = p.team_id === f.home_team_id
          const teamScore = isHome ? Number(f.home_score) : Number(f.away_score)
          const oppScore = isHome ? Number(f.away_score) : Number(f.home_score)
          const { pts, breakdown } = calcPoints(p, Number(p.conceded) || oppScore, isAet ? false : teamScore > oppScore, missedPkSet.has(`${f.id}_${p.player_id}`))
          await sql`
            INSERT INTO fantasy_points (gameweek_id, fixture_id, player_id, points, breakdown)
            VALUES (${gw.id}, ${f.id}, ${p.player_id}, ${pts}, ${JSON.stringify(breakdown)})
            ON CONFLICT (gameweek_id, fixture_id, player_id) DO UPDATE SET points = EXCLUDED.points, breakdown = EXCLUDED.breakdown
          `
          count++
        }
      }

      await sql`
        INSERT INTO fantasy_gw_processed (gameweek_id, steps)
        VALUES (${gw.id}, ${JSON.stringify({ calc_points: count })})
        ON CONFLICT (gameweek_id) DO UPDATE
          SET steps = fantasy_gw_processed.steps || ${JSON.stringify({ calc_points: count })}, processed_at = NOW()
      `
      log.push(`GW${gw.gw_number}: 選手${count}件のポイント計算完了`)
    }

    return Response.json({ ok: true, log })
  } catch (err) {
    console.error('auto-process error:', err)
    return Response.json({ ok: false, error: err.message, log }, { status: 500 })
  }
}
