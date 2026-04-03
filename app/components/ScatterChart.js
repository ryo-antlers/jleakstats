import sql from '@/lib/db'

async function getStandings(group) {
  return await sql`
    SELECT s.goals_for, s.goals_against, s.points, s.rank,
           tm.abbr, tm.color_primary, tm.id AS team_id
    FROM standings s
    LEFT JOIN teams_master tm ON s.team_id = tm.id
    WHERE s.season = 2026 AND tm.group_name = ${group}
  `.catch(() => [])
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
