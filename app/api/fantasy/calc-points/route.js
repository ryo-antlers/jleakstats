import sql from '@/lib/db'

// テーブル作成
async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS fantasy_points (
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

const POS_MAP = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' }

function calcPoints(p, conceded, isWin, missedPk) {
  const pos = POS_MAP[p.position] ?? p.position
  const min = Number(p.minutes) || 0
  let pts = 0
  const bd = {}

  // 出場なし
  if (min === 0) return { pts: 0, breakdown: {} }

  // 出場ボーナス
  if (min >= 90) { pts += 3; bd.minutes_full = 3 }
  else if (min >= 60) { pts += 2; bd.minutes_60 = 2 }
  else { pts += 1; bd.minutes_partial = 1 }

  // 勝利ボーナス
  if (isWin) { pts += 2; bd.win = 2 }

  // ゴール
  const goals = Number(p.goals) || 0
  if (goals > 0) {
    const gpt = pos === 'GK' ? 6 : pos === 'DF' ? 4 : pos === 'MF' ? 4 : 6
    const v = goals * gpt; pts += v; bd.goals = v
  }

  // アシスト
  const assists = Number(p.assists) || 0
  if (assists > 0) {
    const apt = pos === 'GK' ? 5 : pos === 'DF' ? 4 : pos === 'MF' ? 4 : 4
    const v = assists * apt; pts += v; bd.assists = v
  }

  // キーパス（MF/FW）
  if (pos === 'MF' || pos === 'FW') {
    const kp = Number(p.passes_key) || 0
    const v = kp >= 6 ? 3 : kp >= 4 ? 2 : kp >= 2 ? 1 : 0
    if (v > 0) {
      const key = kp >= 6 ? 'key_passes_6' : kp >= 4 ? 'key_passes_4' : 'key_passes_2'
      pts += v; bd[key] = v
    }
  }

  // クリーンシート（90分のみ）
  if (min >= 90 && conceded === 0) {
    const v = pos === 'GK' ? 3 : pos === 'DF' ? 3 : pos === 'MF' ? 1 : 0
    if (v > 0) { pts += v; bd.clean_sheet = v }
  }

  // 失点ペナルティ（GK/DF）
  if (pos === 'GK' || pos === 'DF') {
    const v = conceded >= 4 ? -3 : conceded === 3 ? -2 : conceded === 2 ? -1 : 0
    if (v < 0) {
      const key = conceded >= 4 ? 'conceded_4plus' : conceded === 3 ? 'conceded_3' : 'conceded_2'
      pts += v; bd[key] = v
    }
  }

  // セーブ（GK）
  if (pos === 'GK') {
    const sv = Number(p.saves) || 0
    const v = sv >= 6 ? 3 : sv >= 4 ? 2 : sv >= 2 ? 1 : 0
    if (v > 0) {
      const key = sv >= 6 ? 'saves_6' : sv >= 4 ? 'saves_4' : 'saves_2'
      pts += v; bd[key] = v
    }
  }

  // タックル+インターセプト+ブロック
  const def = (Number(p.tackles) || 0) + (Number(p.interceptions) || 0) + (Number(p.blocks) || 0)
  if (def >= 4) { pts += 3; bd.defensive = 3 }

  // イエロー・レッド
  if (Number(p.yellow_cards) > 0) { pts -= 1; bd.yellow = -1 }
  if (Number(p.red_cards) > 0) { pts -= 4; bd.red = -4 }

  // PKミス
  if (missedPk) { pts -= 3; bd.missed_pk = -3 }

  // レーティングボーナス
  const rating = Number(p.rating) || 0
  if (rating >= 8.0) { pts += 3; bd.rating_high = 3 }
  else if (rating >= 7.5) { pts += 2; bd.rating_mid = 2 }
  else if (rating >= 7.0) { pts += 1; bd.rating_low = 1 }

  return { pts, breakdown: bd }
}

// GW単位でポイント計算・保存
// POST /api/fantasy/calc-points  body: { gameweek_id }
export async function POST(request) {
  try {
    await ensureTable()
    const { gameweek_id } = await request.json()

    // GWに含まれるfixture一覧
    const fixtures = await sql`
      SELECT f.id, f.home_team_id, f.away_team_id, f.home_score, f.away_score, f.status
      FROM fantasy_gameweek_fixtures fgf
      JOIN fixtures f ON f.id = fgf.fixture_id
      WHERE fgf.gameweek_id = ${gameweek_id}
        AND f.status IN ('FT', 'AET', 'PEN')
    `

    if (fixtures.length === 0) {
      return Response.json({ ok: false, error: '対象試合がありません（未終了か対象GWに試合なし）' }, { status: 400 })
    }

    // PKミスした選手を取得
    const fixtureIds = fixtures.map(f => f.id)
    const missedPks = await sql`
      SELECT fixture_id, player_id
      FROM fixture_events
      WHERE fixture_id = ANY(${fixtureIds})
        AND type = 'Goal' AND detail = 'Missed Penalty'
    `
    const missedPkSet = new Set(missedPks.map(e => `${e.fixture_id}_${e.player_id}`))

    // 既存ポイントを削除（再計算）
    await sql`DELETE FROM fantasy_points WHERE gameweek_id = ${gameweek_id}`

    let total = 0
    for (const f of fixtures) {
      const isAet = f.status === 'AET' || f.status === 'PEN'

      // 選手スタッツ取得
      const players = await sql`
        SELECT player_id, position, minutes, rating, goals, assists,
               passes_key, saves, tackles, interceptions, blocks,
               yellow_cards, red_cards, team_id, conceded
        FROM fixture_player_stats
        WHERE fixture_id = ${f.id}
          AND position IN ('G', 'D', 'M', 'F')
      `

      for (const p of players) {
        const isHome = p.team_id === f.home_team_id
        const teamScore = isHome ? Number(f.home_score) : Number(f.away_score)
        const oppScore = isHome ? Number(f.away_score) : Number(f.home_score)
        // PK戦は勝敗に加味しない（通常スコアで判定）
        const isWin = !isAet && teamScore > oppScore || isAet ? false : teamScore > oppScore
        const conceded = Number(p.conceded) || oppScore
        const missedPk = missedPkSet.has(`${f.id}_${p.player_id}`)

        const { pts, breakdown } = calcPoints(p, conceded, isWin, missedPk)

        await sql`
          INSERT INTO fantasy_points (gameweek_id, fixture_id, player_id, points, breakdown)
          VALUES (${gameweek_id}, ${f.id}, ${p.player_id}, ${pts}, ${JSON.stringify(breakdown)})
          ON CONFLICT (gameweek_id, fixture_id, player_id) DO UPDATE
            SET points = EXCLUDED.points, breakdown = EXCLUDED.breakdown
        `
        total++
      }
    }

    return Response.json({ ok: true, gameweek_id, fixtures: fixtures.length, players: total })
  } catch (err) {
    console.error('calc-points error:', err)
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
