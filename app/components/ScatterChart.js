import sql from '@/lib/db'

async function getStandings(group) {
  const [fixtures, teams] = await Promise.all([
    sql`
      SELECT f.home_team_id, f.away_team_id,
             f.home_score, f.away_score, f.home_penalty, f.away_penalty, f.status
      FROM fixtures f
      JOIN teams_master ht ON f.home_team_id = ht.id
      JOIN teams_master at ON f.away_team_id = at.id
      WHERE f.season = 2026 AND f.status IN ('FT', 'AET', 'PEN')
        AND ht.group_name = ${group} AND at.group_name = ${group}
    `.catch(() => []),
    sql`
      SELECT id AS team_id, abbr, color_primary
      FROM teams_master WHERE group_name = ${group}
    `.catch(() => []),
  ])

  const stats = {}
  for (const t of teams) stats[t.team_id] = { ...t, gf: 0, ga: 0, points: 0 }

  for (const f of fixtures) {
    const h = f.home_team_id, a = f.away_team_id
    if (!stats[h] || !stats[a]) continue
    const hs = Number(f.home_score), as_ = Number(f.away_score)
    const isPK = f.status === 'PEN' && f.home_penalty != null
    stats[h].gf += hs; stats[h].ga += as_
    stats[a].gf += as_; stats[a].ga += hs
    if (hs > as_) { stats[h].points += 3 }
    else if (hs < as_) { stats[a].points += 3 }
    else if (isPK) {
      if (Number(f.home_penalty) > Number(f.away_penalty)) { stats[h].points += 2; stats[a].points += 1 }
      else { stats[a].points += 2; stats[h].points += 1 }
    } else { stats[h].points += 1; stats[a].points += 1 }
  }

  const sorted = Object.values(stats).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    const gdA = a.gf - a.ga, gdB = b.gf - b.ga
    if (gdB !== gdA) return gdB - gdA
    return b.gf - a.gf
  })
  return sorted.map((s, i) => ({
    team_id: s.team_id, abbr: s.abbr, color_primary: s.color_primary,
    goals_for: s.gf, goals_against: s.ga, points: s.points, rank: i + 1,
  }))
}

async function getStatsByTeam(group) {
  return await sql`
    SELECT
      fps.team_id,
      AVG(CAST(REPLACE(fps.possession, '%', '') AS FLOAT)) AS avg_possession,
      AVG(CAST(fps.expected_goals AS FLOAT)) AS avg_xg
    FROM fixture_statistics fps
    JOIN fixtures f ON fps.fixture_id = f.id
    JOIN teams_master tm ON fps.team_id = tm.id
    WHERE f.season = 2026 AND tm.group_name = ${group}
      AND fps.possession IS NOT NULL
    GROUP BY fps.team_id
  `.catch(() => [])
}

function Scatter({ data, xKey, yKey, xLabel, yLabel }) {
  const W = 300, H = 220
  const pad = 28

  const xs = data.map(d => parseFloat(d[xKey]) || 0)
  const ys = data.map(d => parseFloat(d[yKey]) || 0)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1

  const cx = (v) => pad + ((v - minX) / rangeX) * (W - pad * 2)
  const cy = (v) => pad + ((maxY - v) / rangeY) * (H - pad * 2)

  const midX = (W - pad * 2) / 2 + pad
  const midY = (H - pad * 2) / 2 + pad

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
      {/* 四象限 */}
      <line x1={midX} x2={midX} y1={pad} y2={H - pad}
        stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      <line x1={pad} x2={W - pad} y1={midY} y2={midY}
        stroke="rgba(255,255,255,0.1)" strokeWidth="1" />

      {/* 軸ラベル */}
      <text x={pad} y={H - 4} style={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)', fontFamily: 'inherit' }}>← {xLabel}少</text>
      <text x={W - pad} y={H - 4} textAnchor="end" style={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)', fontFamily: 'inherit' }}>{xLabel}多 →</text>
      <text x={pad} y={10} style={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)', fontFamily: 'inherit' }}>↑ {yLabel}多</text>

      {/* プロット（順位降順で描画→上位が前面） */}
      {[...data].sort((a, b) => (b.rank ?? 99) - (a.rank ?? 99)).map((d) => {
        const px = Math.max(pad + 5, Math.min(W - pad - 5, cx(parseFloat(d[xKey]) || 0)))
        const py = Math.max(pad + 5, Math.min(H - pad - 5, cy(parseFloat(d[yKey]) || 0)))
        return (
          <a key={d.abbr} href={`/team/${d.team_id}`} style={{ cursor: 'pointer' }}>
            <g>
              <circle cx={px} cy={py} r="5" fill={d.color_primary ?? '#888'} />
              <text x={px} y={py - 8} textAnchor="middle"
                style={{ fontSize: 8, fill: d.color_primary ?? '#888', fontFamily: 'inherit', fontWeight: 700 }}>
                {d.abbr}
              </text>
            </g>
          </a>
        )
      })}
    </svg>
  )
}

export default async function ScatterChart({ group }) {
  const [standings, stats] = await Promise.all([getStandings(group), getStatsByTeam(group)])
  if (standings.length === 0) return null

  // standingsにstatsをマージ
  const merged = standings.map(s => {
    const st = stats.find(t => t.team_id === s.team_id) ?? {}
    return { ...s, avg_possession: st.avg_possession, avg_xg: st.avg_xg }
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, marginTop: 32, borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
      {/* 得点×失点 */}
      <Scatter
        data={merged}
        xKey="goals_against"
        yKey="goals_for"
        xLabel="失点"
        yLabel="得点"
      />
      {/* ポゼッション×勝ち点 */}
      <Scatter
        data={merged.filter(d => d.avg_possession != null)}
        xKey="avg_possession"
        yKey="points"
        xLabel="ポゼッション"
        yLabel="勝点"
      />
      {/* xG×得点 */}
      <Scatter
        data={merged.filter(d => d.avg_xg != null)}
        xKey="avg_xg"
        yKey="goals_for"
        xLabel="xG"
        yLabel="得点"
      />
    </div>
  )
}
