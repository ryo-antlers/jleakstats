import sql from '@/lib/db'

async function getMatches(group) {
  return await sql`
    SELECT
      f.id, f.home_team_id, f.away_team_id,
      f.home_score, f.away_score,
      f.home_penalty, f.away_penalty, f.status,
      ht.abbr AS home_abbr, ht.color_primary AS home_color,
      at.abbr AS away_abbr, at.color_primary AS away_color
    FROM fixtures f
    JOIN teams_master ht ON f.home_team_id = ht.id
    JOIN teams_master at ON f.away_team_id = at.id
    WHERE f.season = 2026
      AND f.status IN ('FT', 'AET', 'PEN')
      AND ht.group_name = ${group}
      AND at.group_name = ${group}
  `.catch(() => [])
}

async function getTeams(group) {
  return await sql`
    SELECT tm.id, tm.abbr, tm.color_primary, s.rank
    FROM teams_master tm
    LEFT JOIN standings s ON s.team_id = tm.id AND s.season = 2026
    WHERE tm.group_name = ${group}
    ORDER BY s.rank ASC
  `.catch(() => [])
}

export default async function HeatmapChart({ group }) {
  const [matches, teams] = await Promise.all([getMatches(group), getTeams(group)])
  if (teams.length === 0) return null

  // 対戦マップ: home_id -> away_id -> { home_score, away_score }
  const matchMap = {}
  for (const m of matches) {
    if (!matchMap[m.home_team_id]) matchMap[m.home_team_id] = {}
    matchMap[m.home_team_id][m.away_team_id] = {
      id: m.id,
      homeScore: m.home_score,
      awayScore: m.away_score,
      homePenalty: m.home_penalty,
      awayPenalty: m.away_penalty,
      status: m.status,
    }
  }

  const cellW = 36
  const cellH = 16
  const labelW = 26
  const labelH = 18
  const n = teams.length
  const W = labelW + cellW * n
  const H = labelH + cellH * n

  // 結果に応じた色
  function cellColor(homeScore, awayScore, homePenalty, awayPenalty, status) {
    if (homeScore == null) return '#222'
    if (homeScore > awayScore) return '#2d7a3a'   // 勝: 緑
    if (homeScore < awayScore) return '#8c3535'   // 負: 赤
    // 引き分け→PK判定
    if (status === 'PEN' && homePenalty != null && awayPenalty != null) {
      if (Number(homePenalty) > Number(awayPenalty)) return '#1a5c2a'  // PK勝: 濃い緑
      return '#7a2d2d'                                                   // PK負: 濃い赤
    }
    return '#3a3a1a'                               // 分: 黄
  }

  return (
    <div style={{ marginTop: 48, overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>

        {/* 列ラベル（アウェイ） */}
        {teams.map((t, ci) => (
          <a key={`col-${t.id}`} href={`/team/${t.id}`} style={{ cursor: 'pointer' }}>
            <text
              x={labelW + ci * cellW + cellW / 2}
              y={labelH - 4}
              textAnchor="middle"
              style={{ fontSize: 7, fill: t.color_primary ?? '#aaa', fontFamily: 'inherit', fontWeight: 700 }}
            >
              {t.abbr}
            </text>
          </a>
        ))}

        {/* 行ラベル（ホーム） */}
        {teams.map((t, ri) => (
          <a key={`row-${t.id}`} href={`/team/${t.id}`} style={{ cursor: 'pointer' }}>
            <text
              x={labelW - 4}
              y={labelH + ri * cellH + cellH / 2 + 3}
              textAnchor="end"
              style={{ fontSize: 7, fill: t.color_primary ?? '#aaa', fontFamily: 'inherit', fontWeight: 700 }}
            >
              {t.abbr}
            </text>
          </a>
        ))}

        {/* セル */}
        {teams.map((homeTeam, ri) =>
          teams.map((awayTeam, ci) => {
            if (homeTeam.id === awayTeam.id) {
              return (
                <rect
                  key={`${ri}-${ci}`}
                  x={labelW + ci * cellW}
                  y={labelH + ri * cellH}
                  width={cellW}
                  height={cellH}
                  fill="#222"
                />
              )
            }
            const match = matchMap[homeTeam.id]?.[awayTeam.id]
            const bg = cellColor(match?.homeScore, match?.awayScore, match?.homePenalty, match?.awayPenalty, match?.status)
            const score = match ? `${match.homeScore}-${match.awayScore}` : ''
            const isPK = match?.status === 'PEN' && match?.homePenalty != null && match?.awayPenalty != null
            const pkScore = isPK ? `PK ${match.homePenalty}-${match.awayPenalty}` : ''
            const cx = labelW + ci * cellW + cellW / 2
            const cy = labelH + ri * cellH + cellH / 2
            const inner = (
              <>
                <rect
                  x={labelW + ci * cellW}
                  y={labelH + ri * cellH}
                  width={cellW}
                  height={cellH}
                  fill={bg}
                />
                {score && (
                  <text
                    x={cx}
                    y={isPK ? cy + 1 : cy + 3}
                    textAnchor="middle"
                    style={{ fontSize: 7, fill: '#fff', fontFamily: 'inherit', fontWeight: 700 }}
                  >
                    {score}
                  </text>
                )}
                {pkScore && (
                  <text
                    x={cx}
                    y={cy + 5.5}
                    textAnchor="middle"
                    style={{ fontSize: 4, fill: '#bbb', fontFamily: 'inherit', fontWeight: 400 }}
                  >
                    {pkScore}
                  </text>
                )}
              </>
            )
            return match?.id ? (
              <a key={`${ri}-${ci}`} href={`/fixture/${match.id}`}>
                <g style={{ cursor: 'pointer' }}>{inner}</g>
              </a>
            ) : (
              <g key={`${ri}-${ci}`}>{inner}</g>
            )
          })
        )}
      </svg>
    </div>
  )
}
