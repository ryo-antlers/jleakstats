import sql from '@/lib/db'

async function getPlayerStats(group) {
  return await sql`
    SELECT
      fps.player_id,
      COALESCE(pm.name_ja, pm.name_en) AS name,
      tm.color_primary,
      SUM(fps.shots_total) AS shots,
      SUM(fps.goals) AS goals,
      SUM(fps.minutes) AS minutes
    FROM fixture_player_stats fps
    JOIN fixtures f ON fps.fixture_id = f.id
    JOIN players_master pm ON fps.player_id = pm.id
    JOIN teams_master tm ON fps.team_id = tm.id
    WHERE f.season = 2026 AND tm.group_name = ${group}
    GROUP BY fps.player_id, pm.name_ja, pm.name_en, tm.color_primary
    HAVING SUM(fps.shots_total) > 0
    ORDER BY SUM(fps.goals) DESC, SUM(fps.shots_total) DESC
  `.catch(() => [])
}

export default async function PlayerScatterChart({ group }) {
  const data = await getPlayerStats(group)
  if (data.length === 0) return null

  const W = 500, H = 300
  const pad = 32

  const shots = data.map(d => Number(d.shots))
  const goals = data.map(d => Number(d.goals))
  const maxShots = Math.max(...shots, 1)
  const maxGoals = Math.max(...goals, 1)

  const cx = (v) => pad + (v / maxShots) * (W - pad * 2)
  const cy = (v) => pad + ((maxGoals - v) / maxGoals) * (H - pad * 2)

  return (
    <div style={{ marginTop: 32 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {/* 軸ラベル */}
        <text x={pad} y={H - 4} style={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)', fontFamily: 'inherit' }}>← シュート少</text>
        <text x={W - pad} y={H - 4} textAnchor="end" style={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)', fontFamily: 'inherit' }}>シュート多 →</text>
        <text x={pad} y={12} style={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)', fontFamily: 'inherit' }}>↑ ゴール多</text>

        {/* プロット（ゴール少ない順に描画→多い選手が前面） */}
        {[...data].sort((a, b) => Number(a.goals) - Number(b.goals)).map((d) => {
          const g = Number(d.goals)
          const x = Math.max(pad + 5, Math.min(W - pad - 5, cx(Number(d.shots))))
          const y = Math.max(pad + 5, Math.min(H - pad - 5, cy(g)))
          const showLabel = g >= 2
          return (
            <g key={d.player_id}>
              <circle
                cx={x} cy={y}
                r={g === 0 ? 2 : 4}
                fill={d.color_primary ?? '#888'}
                opacity={g === 0 ? 0.25 : 1}
              />
              {showLabel && (
                <text x={x} y={y - 7} textAnchor="middle"
                  style={{ fontSize: 7, fill: d.color_primary ?? '#888', fontFamily: 'inherit', fontWeight: 700 }}>
                  {d.name}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
