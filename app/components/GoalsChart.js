import sql from '@/lib/db'

async function getTopScorers(group) {
  return await sql`
    WITH top_scorers AS (
      SELECT fps.player_id, SUM(fps.goals) AS total_goals
      FROM fixture_player_stats fps
      JOIN fixtures f ON fps.fixture_id = f.id
      JOIN teams_master tm ON fps.team_id = tm.id
      WHERE f.season = 2026 AND tm.group_name = ${group} AND fps.goals > 0
      GROUP BY fps.player_id
      HAVING SUM(fps.goals) > 0
      ORDER BY total_goals DESC
      LIMIT 10
    )
    SELECT
      fps.player_id,
      f.round_number,
      SUM(fps.goals) AS goals_in_round,
      COALESCE(pm.name_ja, pm.name_en) AS name,
      tm.color_primary
    FROM fixture_player_stats fps
    JOIN fixtures f ON fps.fixture_id = f.id
    JOIN top_scorers ts ON fps.player_id = ts.player_id
    JOIN players_master pm ON fps.player_id = pm.id
    JOIN teams_master tm ON fps.team_id = tm.id
    WHERE f.season = 2026 AND f.round_number IS NOT NULL
    GROUP BY fps.player_id, f.round_number, pm.name_ja, pm.name_en, tm.color_primary
    ORDER BY fps.player_id, f.round_number
  `.catch(() => [])
}

export default async function GoalsChart({ group }) {
  const rows = await getTopScorers(group)
  if (rows.length === 0) return null

  // プレイヤーごとに節別ゴール数を集計
  const playerMap = {}
  for (const r of rows) {
    if (!playerMap[r.player_id]) {
      playerMap[r.player_id] = {
        name: r.name,
        color: r.color_primary ?? '#888',
        rounds: {},
      }
    }
    playerMap[r.player_id].rounds[r.round_number] = Number(r.goals_in_round)
  }

  const allRounds = [...new Set(rows.map(r => r.round_number))].sort((a, b) => a - b)
  const maxRound = allRounds[allRounds.length - 1] ?? 1

  // 累積ゴール計算
  const players = Object.entries(playerMap).map(([id, p]) => {
    let cum = 0
    const cumGoals = allRounds.map(r => {
      cum += p.rounds[r] ?? 0
      return { round: r, goals: cum }
    })
    return { id, name: p.name, color: p.color, cumGoals, total: cum }
  }).sort((a, b) => b.total - a.total)

  const activePlayers = players.filter(p => p.total > 0)
  if (activePlayers.length === 0) return null
  const maxGoals = Math.max(...activePlayers.map(p => p.total))

  const W = 600, H = 260
  const padL = 8, padR = 80, padT = 16, padB = 20
  const chartW = W - padL - padR
  const chartH = H - padT - padB

  const x = (round) => padL + ((round - 1) / Math.max(maxRound - 1, 1)) * chartW
  const y = (goals) => padT + chartH - (goals / maxGoals) * chartH

  return (
    <div style={{ marginTop: 32 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {activePlayers.map(p => {
          const pts = p.cumGoals.map(d => `${x(d.round)},${y(d.goals)}`).join(' ')
          const last = p.cumGoals[p.cumGoals.length - 1]
          if (!last) return null
          return (
            <g key={p.id}>
              <polyline
                points={pts}
                fill="none"
                stroke={p.color}
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <circle cx={x(last.round)} cy={y(last.goals)} r="3" fill={p.color} />
              <text
                x={x(last.round) + 6}
                y={y(last.goals) + 4}
                style={{ fontSize: 8, fill: p.color, fontFamily: 'inherit', fontWeight: 700 }}
              >
                {p.name}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
