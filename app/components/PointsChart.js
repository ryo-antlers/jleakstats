import sql from '@/lib/db'

async function getFixtureResults(group) {
  return await sql`
    SELECT
      f.home_team_id, f.away_team_id,
      f.home_score, f.away_score, f.home_penalty, f.away_penalty, f.status,
      ht.group_name AS home_group, at.group_name AS away_group
    FROM fixtures f
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    WHERE f.season = 2026 AND f.status IN ('FT', 'AET', 'PEN')
      AND (ht.group_name = ${group} OR at.group_name = ${group})
  `.catch(() => [])
}

async function getTeams(group) {
  return await sql`
    SELECT id, abbr, color_primary, group_name
    FROM teams_master WHERE group_name = ${group}
  `.catch(() => [])
}

function buildStandings(fixtures, teams) {
  const teamIds = new Set(teams.map(t => t.id))
  const points = {}, gd = {}, gf = {}
  for (const t of teams) { points[t.id] = 0; gd[t.id] = 0; gf[t.id] = 0 }

  for (const f of fixtures) {
    if (f.home_score == null || f.away_score == null) continue
    const h = f.home_team_id, a = f.away_team_id
    if (!teamIds.has(h) || !teamIds.has(a)) continue
    const ht = teams.find(t => t.id === h), at = teams.find(t => t.id === a)
    if (!ht || !at || ht.group_name !== at.group_name) continue
    const hs = Number(f.home_score), as_ = Number(f.away_score)
    gf[h] += hs; gf[a] += as_
    gd[h] += hs - as_; gd[a] += as_ - hs
    if (hs > as_) { points[h] += 3 }
    else if (hs < as_) { points[a] += 3 }
    else if (f.status === 'PEN' && f.home_penalty != null && f.away_penalty != null) {
      if (Number(f.home_penalty) > Number(f.away_penalty)) { points[h] += 2; points[a] += 1 }
      else { points[a] += 2; points[h] += 1 }
    } else { points[h] += 1; points[a] += 1 }
  }

  return [...teams].sort((a, b) => {
    const pd = (points[b.id] ?? 0) - (points[a.id] ?? 0)
    if (pd !== 0) return pd
    const gdd = (gd[b.id] ?? 0) - (gd[a.id] ?? 0)
    if (gdd !== 0) return gdd
    return (gf[b.id] ?? 0) - (gf[a.id] ?? 0)
  }).map(t => ({
    ...t,
    points: points[t.id] ?? 0,
    gd: gd[t.id] ?? 0,
  }))
}

export default async function PointsChart({ group }) {
  const [fixtures, teams] = await Promise.all([
    getFixtureResults(group),
    getTeams(group),
  ])

  const rows = buildStandings(fixtures, teams)
  if (rows.length === 0) return null

  const maxPoints = Math.max(...rows.map(r => r.points), 1)

  const W = 600, H = 260
  const padL = 28, padR = 8, padT = 16, padB = 20
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const teamCount = rows.length
  const barW = (chartW / teamCount) * 0.85
  const gap = chartW / teamCount
  const yScale = (pts) => chartH - (pts / maxPoints) * chartH

  const topTeam = rows[0]
  const bottomTeam = rows[rows.length - 1]
  const midPts = Math.ceil((topTeam.points + bottomTeam.points) / 2)

  const refLines = [
    { pts: topTeam.points,    color: topTeam.color_primary ?? '#fff',    label: `${topTeam.points}pt`, labelOffset: 8 },
    { pts: bottomTeam.points, color: bottomTeam.color_primary ?? '#fff',  label: `${bottomTeam.points}pt`, labelOffset: 8 },
    { pts: midPts,            color: 'rgba(255,255,255,0.4)',              label: `${midPts}pt`, labelOffset: 8 },
  ]

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {/* 棒グラフ */}
        {rows.map((team, i) => {
          const pts = team.points
          const barH = (pts / maxPoints) * chartH
          const bx = padL + i * gap
          const by = padT + yScale(pts)
          return (
            <g key={team.abbr ?? i}>
              <rect x={bx} y={by} width={barW} height={barH} fill={team.color_primary ?? '#555'} />
              <text
                x={bx + barW / 2} y={H - 4}
                textAnchor="middle"
                style={{ fontSize: 9, fill: team.color_primary ?? 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}
              >
                {team.abbr}
              </text>
            </g>
          )
        })}

        {/* 参照ライン（最前面） */}
        {refLines.map(({ pts, color, label }, idx) => {
          const ly = padT + yScale(pts)
          return (
            <g key={`ref-${pts}-${idx}`}>
              <line
                x1={padL} x2={W - padR}
                y1={ly} y2={ly}
                stroke={color} strokeWidth={1.0} opacity={0.8}
              />
              <text
                x={padL - 6} y={ly + 3}
                textAnchor="end"
                style={{ fontSize: 10, fill: color, fontFamily: 'inherit', opacity: 0.9 }}
              >
                {label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
