import sql from '@/lib/db'

function calcPoints(p, conceded, isWin) {
  let pts = 0
  const breakdown = {}
  // G/D/M/F → GK/DF/MF/FW に正規化
  const posMap = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' }
  const pos = posMap[p.position] ?? p.position

  // 出場ボーナス
  const min = Number(p.minutes) || 0
  if (min >= 90) { pts += 3; breakdown.minutes_full = 3 }
  else if (min >= 60) { pts += 2; breakdown.minutes_60 = 2 }
  else if (min >= 1) { pts += 1; breakdown.minutes_partial = 1 }
  else return { pts: 0, breakdown: { no_minutes: true } }

  // 勝利ボーナス
  if (isWin) { pts += 2; breakdown.win = 2 }

  // ゴール
  const goals = Number(p.goals) || 0
  if (goals > 0) {
    const gpt = pos === 'GK' ? 6 : pos === 'DF' ? 4 : pos === 'MF' ? 4 : 5
    pts += goals * gpt
    breakdown.goals = goals * gpt
  }

  // アシスト
  const assists = Number(p.assists) || 0
  if (assists > 0) {
    const apt = pos === 'GK' ? 5 : pos === 'DF' ? 4 : pos === 'MF' ? 4 : 4
    pts += assists * apt
    breakdown.assists = assists * apt
  }

  // キーパス（MF/FW）
  if (pos === 'MF' || pos === 'FW') {
    const kp = Number(p.passes_key) || 0
    const kppt = kp >= 6 ? 3 : kp >= 4 ? 2 : kp >= 2 ? 1 : 0
    if (kppt > 0) {
      const key = kp >= 6 ? 'key_passes_6' : kp >= 4 ? 'key_passes_4' : 'key_passes_2'
      pts += kppt; breakdown[key] = kppt
    }
  }

  // クリーンシート
  const cs = conceded === 0 && min >= 90
  if (cs) {
    const cspt = pos === 'GK' ? 4 : pos === 'DF' ? 3 : pos === 'MF' ? 1 : 0
    if (cspt > 0) { pts += cspt; breakdown.clean_sheet = cspt }
  }

  // 失点ペナルティ（GK/DF）
  if (pos === 'GK' || pos === 'DF') {
    const concede = Number(conceded) || 0
    const dpt = concede >= 4 ? -3 : concede === 3 ? -2 : concede === 2 ? -1 : 0
    if (dpt < 0) {
      const key = concede >= 4 ? 'conceded_4plus' : concede === 3 ? 'conceded_3' : 'conceded_2'
      pts += dpt; breakdown[key] = dpt
    }
  }

  // セーブ（GK）
  if (pos === 'GK') {
    const sv = Number(p.saves) || 0
    const svpt = sv >= 6 ? 3 : sv >= 4 ? 2 : sv >= 2 ? 1 : 0
    if (svpt > 0) {
      const key = sv >= 6 ? 'saves_6' : sv >= 4 ? 'saves_4' : 'saves_2'
      pts += svpt; breakdown[key] = svpt
    }
  }

  // タックル+インターセプト+ブロック
  const def = (Number(p.tackles) || 0) + (Number(p.interceptions) || 0) + (Number(p.blocks) || 0)
  if (def >= 4) { pts += 3; breakdown.defensive = 3 }

  // イエロー・レッド
  if (Number(p.yellow_cards) > 0) { pts -= 1; breakdown.yellow = -1 }
  if (Number(p.red_cards) > 0) { pts -= 4; breakdown.red = -4 }

  // レーティング
  const rating = Number(p.rating) || 0
  if (rating >= 8.0) { pts += 3; breakdown.rating_high = 3 }
  else if (rating >= 7.5) { pts += 2; breakdown.rating_mid = 2 }
  else if (rating >= 7.0) { pts += 1; breakdown.rating_low = 1 }

  return { pts, breakdown }
}

export async function GET() {
  // 全fixture_player_statsを取得（試合結果・失点数も含む）
  const rows = await sql`
    SELECT
      fps.player_id, fps.position, fps.minutes, fps.rating,
      fps.goals, fps.assists, fps.passes_key, fps.saves,
      fps.tackles, fps.interceptions, fps.blocks,
      fps.yellow_cards, fps.red_cards, fps.conceded,
      f.home_score, f.away_score,
      f.home_team_id, f.away_team_id,
      fps.team_id
    FROM fixture_player_stats fps
    JOIN fixtures f ON fps.fixture_id = f.id
    WHERE f.season = 2026
      AND f.status IN ('FT', 'AET', 'PEN')
      AND fps.position IN ('G', 'D', 'M', 'F')
      AND fps.minutes > 0
  `

  // ポジション別集計
  const posMap = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' }
  const stats = { GK: [], DF: [], MF: [], FW: [] }

  for (const p of rows) {
    const isHome = p.team_id === p.home_team_id
    const teamScore = isHome ? Number(p.home_score) : Number(p.away_score)
    const oppScore = isHome ? Number(p.away_score) : Number(p.home_score)
    const isWin = teamScore > oppScore
    const conceded = oppScore

    const { pts } = calcPoints(p, conceded, isWin)
    const normPos = posMap[p.position] ?? p.position
    if (stats[normPos]) stats[normPos].push(pts)
  }

  const result = {}
  for (const [pos, arr] of Object.entries(stats)) {
    if (arr.length === 0) continue
    arr.sort((a, b) => a - b)
    const avg = arr.reduce((s, v) => s + v, 0) / arr.length
    const median = arr[Math.floor(arr.length / 2)]
    const p90 = arr[Math.floor(arr.length * 0.9)]
    result[pos] = {
      count: arr.length,
      avg: Math.round(avg * 10) / 10,
      median,
      max: arr[arr.length - 1],
      min: arr[0],
      p90,
      dist: {
        '0-2': arr.filter(v => v <= 2).length,
        '3-5': arr.filter(v => v >= 3 && v <= 5).length,
        '6-9': arr.filter(v => v >= 6 && v <= 9).length,
        '10-14': arr.filter(v => v >= 10 && v <= 14).length,
        '15+': arr.filter(v => v >= 15).length,
      }
    }
  }

  return Response.json(result)
}
