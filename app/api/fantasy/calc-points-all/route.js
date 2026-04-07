import sql from '@/lib/db'

const POS_MAP = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' }

function calcPoints(p, conceded, isWin, missedPk) {
  const pos = POS_MAP[p.position] ?? p.position
  const min = Number(p.minutes) || 0
  let pts = 0
  const bd = {}

  if (min === 0) return { pts: 0, breakdown: {} }

  if (min >= 90) { pts += 3; bd.minutes = 3 }
  else if (min >= 60) { pts += 2; bd.minutes = 2 }
  else { pts += 1; bd.minutes = 1 }

  if (isWin) { pts += 2; bd.win = 2 }

  const goals = Number(p.goals) || 0
  if (goals > 0) {
    const gpt = pos === 'GK' ? 6 : pos === 'DF' ? 4 : pos === 'MF' ? 4 : 6
    const v = goals * gpt; pts += v; bd.goals = v
  }

  const assists = Number(p.assists) || 0
  if (assists > 0) {
    const apt = pos === 'GK' ? 5 : pos === 'DF' ? 4 : pos === 'MF' ? 4 : 4
    const v = assists * apt; pts += v; bd.assists = v
  }

  if (pos === 'MF' || pos === 'FW') {
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

  if (Number(p.yellow_cards) > 0) { pts -= 2; bd.yellow = -2 }
  if (Number(p.red_cards) > 0) { pts -= 5; bd.red = -5 }

  if (missedPk) { pts -= 3; bd.missed_pk = -3 }

  const rating = Number(p.rating) || 0
  if (rating >= 8.0) { pts += 3; bd.rating = 3 }
  else if (rating >= 7.5) { pts += 2; bd.rating = 2 }
  else if (rating >= 7.0) { pts += 1; bd.rating = 1 }

  return { pts, breakdown: bd }
}

async function ensureTable() {
  await sql`DROP TABLE IF EXISTS fantasy_points`
  await sql`
    CREATE TABLE fantasy_points (
      id SERIAL PRIMARY KEY,
      gameweek_id INTEGER REFERENCES fantasy_gameweeks(id),
      fixture_id INTEGER,
      player_id INTEGER,
      points INTEGER NOT NULL DEFAULT 0,
      breakdown JSONB,
      UNIQUE (gameweek_id, fixture_id, player_id)
    )
  `
}

// GET /api/fantasy/calc-points-all?until_gw=9
// 価格変動なしでポイントだけ計算・保存
export async function GET(request) {
  await ensureTable()
  const { searchParams } = new URL(request.url)
  const untilGw = parseInt(searchParams.get('until_gw') ?? '9')

  const gameweeks = await sql`
    SELECT id, gw_number FROM fantasy_gameweeks
    WHERE gw_number <= ${untilGw}
    ORDER BY gw_number ASC
  `

  const results = []

  for (const gw of gameweeks) {
    const fixtures = await sql`
      SELECT f.id, f.home_team_id, f.away_team_id, f.home_score, f.away_score, f.status
      FROM fantasy_gameweek_fixtures fgf
      JOIN fixtures f ON f.id = fgf.fixture_id
      WHERE fgf.gameweek_id = ${gw.id}
        AND f.status IN ('FT', 'AET', 'PEN')
    `

    if (fixtures.length === 0) {
      results.push({ gw: gw.gw_number, skipped: true })
      continue
    }

    const fixtureIds = fixtures.map(f => f.id)
    const missedPks = await sql`
      SELECT fixture_id, player_id FROM fixture_events
      WHERE fixture_id = ANY(${fixtureIds})
        AND type = 'Goal' AND detail = 'Missed Penalty'
    `
    const missedPkSet = new Set(missedPks.map(e => `${e.fixture_id}_${e.player_id}`))

    await sql`DELETE FROM fantasy_points WHERE gameweek_id = ${gw.id}`

    let count = 0
    for (const f of fixtures) {
      const isAet = f.status === 'AET' || f.status === 'PEN'
      const players = await sql`
        SELECT player_id, position, minutes, rating, goals, assists,
               passes_key, saves, tackles, interceptions, blocks,
               yellow_cards, red_cards, team_id, conceded
        FROM fixture_player_stats
        WHERE fixture_id = ${f.id} AND position IN ('G', 'D', 'M', 'F')
      `

      for (const p of players) {
        const isHome = p.team_id === f.home_team_id
        const teamScore = isHome ? Number(f.home_score) : Number(f.away_score)
        const oppScore = isHome ? Number(f.away_score) : Number(f.home_score)
        const isWin = !isAet && teamScore > oppScore
        const conceded = Number(p.conceded) || oppScore
        const missedPk = missedPkSet.has(`${f.id}_${p.player_id}`)

        const { pts, breakdown } = calcPoints(p, conceded, isWin, missedPk)

        await sql`
          INSERT INTO fantasy_points (gameweek_id, fixture_id, player_id, points, breakdown)
          VALUES (${gw.id}, ${f.id}, ${p.player_id}, ${pts}, ${JSON.stringify(breakdown)})
          ON CONFLICT (gameweek_id, fixture_id, player_id) DO UPDATE
            SET points = EXCLUDED.points, breakdown = EXCLUDED.breakdown
        `
        count++
      }
    }

    results.push({ gw: gw.gw_number, fixtures: fixtures.length, players: count })
  }

  return Response.json({ ok: true, results })
}
