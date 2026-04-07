import sql from '@/lib/db'

const BD_LABELS = {
  // 新キー
  minutes_full:    '出場（フル）',
  minutes_60:      '出場（60分以上）',
  minutes_partial: '出場（59分未満）',
  win:             '勝利',
  goals:           'ゴール',
  assists:         'アシスト',
  key_passes_2:    'キーパス2~3本',
  key_passes_4:    'キーパス4~5本',
  key_passes_6:    'キーパス6本以上',
  clean_sheet:     'クリーンシート',
  conceded_2:      '複数失点',
  conceded_3:      '3失点',
  conceded_4plus:  '4失点以上',
  saves_2:         'セーブ 2-3本',
  saves_4:         'セーブ 4-5本',
  saves_6:         'セーブ 6本以上',
  defensive:       '守備ボーナス',
  yellow:          'イエローカード',
  red:             'レッドカード',
  missed_pk:       'PKミス',
  rating_high:     'レーティング大ボーナス',
  rating_mid:      'レーティング中ボーナス',
  rating_low:      'レーティング小ボーナス',
  // 旧キー（再計算前のデータ用）
  minutes:         '出場',
  key_passes:      'キーパス',
  conceded:        '失点',
  saves:           'セーブ',
  rating:          'レーティング',
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const gwId = parseInt(searchParams.get('gw_id'))
  const playerId = parseInt(searchParams.get('player_id'))
  if (!gwId || !playerId) return Response.json({ fixtures: [] })

  // GW内のこの選手のポイントデータ（fixture別）
  const rows = await sql`
    SELECT
      fp.fixture_id,
      fp.points,
      fp.breakdown,
      f.date,
      f.home_team_id,
      f.away_team_id,
      f.home_score,
      f.away_score,
      ht.name_ja AS home_name,
      at.name_ja AS away_name,
      -- この選手が所属するチームを特定
      pm.team_id
    FROM fantasy_points fp
    JOIN fixtures f ON f.id = fp.fixture_id
    JOIN teams_master ht ON ht.id = f.home_team_id
    JOIN teams_master at ON at.id = f.away_team_id
    JOIN players_master pm ON pm.id = fp.player_id
    WHERE fp.gameweek_id = ${gwId}
      AND fp.player_id = ${playerId}
    ORDER BY f.date
  `

  const JST = 'Asia/Tokyo'
  const fixtures = rows.map(r => {
    const isHome = r.team_id === r.home_team_id
    const opponent = isHome ? r.away_name : r.home_name
    const d = new Date(r.date)
    const dateStr = new Intl.DateTimeFormat('ja-JP', { timeZone: JST, month: 'numeric', day: 'numeric' }).format(d)

    const breakdown = r.breakdown ?? {}
    const events = Object.entries(breakdown)
      .filter(([, v]) => v !== 0)
      .map(([key, pts]) => ({ label: BD_LABELS[key] ?? key, pts }))

    return { date: dateStr, opponent, points: r.points, events }
  })

  return Response.json({ fixtures })
}
