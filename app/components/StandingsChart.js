import sql from '@/lib/db'

async function getFixtureResults() {
  return await sql`
    SELECT
      f.round_number, f.home_team_id, f.away_team_id,
      f.home_score, f.away_score, f.home_penalty, f.away_penalty, f.status,
      ht.group_name AS home_group, ht.color_primary AS home_color, ht.abbr AS home_abbr,
      at.group_name AS away_group, at.color_primary AS away_color, at.abbr AS away_abbr
    FROM fixtures f
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    WHERE f.season = 2026 AND f.status IN ('FT', 'AET', 'PEN')
      AND f.round_number IS NOT NULL
    ORDER BY f.round_number ASC
  `
}

async function getTeams() {
  return await sql`
    SELECT id, abbr, color_primary, group_name
    FROM teams_master
    WHERE group_name IN ('EAST', 'WEST')
  `
}

function buildHistory(fixtures, teams) {
  const teamIds = new Set(teams.map(t => t.id))
  const rounds = [...new Set(fixtures.map(f => f.round_number))].sort((a, b) => a - b)
  const points = {}, gd = {}, gf = {}, gameCount = {}
  for (const t of teams) { points[t.id] = 0; gd[t.id] = 0; gf[t.id] = 0; gameCount[t.id] = 0 }

  // history[teamId] = [{gameNum, rank}, ...]
  const history = {}
  for (const t of teams) history[t.id] = []

  for (const round of rounds) {
    const roundFixtures = fixtures.filter(f => f.round_number === round)
    const playedThisRound = new Set()

    for (const f of roundFixtures) {
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
      gameCount[h]++; gameCount[a]++
      playedThisRound.add(h); playedThisRound.add(a)
    }

    if (playedThisRound.size === 0) continue

    for (const group of ['EAST', 'WEST']) {
      const groupTeams = teams.filter(t => t.group_name === group)
      const sorted = [...groupTeams].sort((a, b) => {
        const pd = (points[b.id] ?? 0) - (points[a.id] ?? 0)
        if (pd !== 0) return pd
        const gdd = (gd[b.id] ?? 0) - (gd[a.id] ?? 0)
        if (gdd !== 0) return gdd
        return (gf[b.id] ?? 0) - (gf[a.id] ?? 0)
      })
      sorted.forEach((t, i) => {
        // 今節試合したチームのみ記録
        if (playedThisRound.has(t.id)) {
          history[t.id].push({ gameNum: gameCount[t.id], rank: i + 1 })
        }
      })
    }
  }

  const maxGames = Math.max(...Object.values(gameCount), 1)

  // 現時点の最終順位（試合数に関わらず勝ち点で計算）
  const finalRank = {}
  for (const group of ['EAST', 'WEST']) {
    const groupTeams = teams.filter(t => t.group_name === group)
    const sorted = [...groupTeams].sort((a, b) => {
      const pd = (points[b.id] ?? 0) - (points[a.id] ?? 0)
      if (pd !== 0) return pd
      const gdd = (gd[b.id] ?? 0) - (gd[a.id] ?? 0)
      if (gdd !== 0) return gdd
      return (gf[b.id] ?? 0) - (gf[a.id] ?? 0)
    })
    sorted.forEach((t, i) => { finalRank[t.id] = i + 1 })
  }

  return { history, maxGames, finalRank }
}

function LineChart({ teams, history, maxGames, finalRank, group }) {
  const groupTeams = teams.filter(t => t.group_name === group)
  const teamCount = groupTeams.length

  const W = 600, H = 260
  const padL = 8, padR = 36, padT = 16, padB = 28
  const chartW = W - padL - padR
  const chartH = H - padT - padB

  const x = (gameNum) => padL + ((gameNum - 1) / Math.max(maxGames - 1, 1)) * chartW
  const y = (rank) => padT + ((rank - 1) / (teamCount - 1)) * chartH

  // 目盛りの間隔を決める（多すぎないように）
  const tickInterval = maxGames <= 10 ? 1 : maxGames <= 20 ? 2 : 5
  const ticks = []
  for (let i = 1; i <= maxGames; i++) {
    if (i === 1 || i % tickInterval === 0) ticks.push(i)
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {/* 試合数メモリ */}
      {ticks.map(g => (
        <text
          key={g}
          x={x(g)} y={H - 4}
          textAnchor="middle"
          style={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)', fontFamily: 'inherit' }}
        >
          {g}
        </text>
      ))}
      {groupTeams.map(team => {
        const pts = history[team.id] ?? []
        if (pts.length < 1) return null
        const last = pts[pts.length - 1]
        const color = team.color_primary ?? '#888'
        const currentRank = finalRank[team.id] ?? last.rank
        const hasFewerGames = last.gameNum < maxGames
        // maxGames到達済みだが順位が変わっている場合は最終点をfinalRankに修正して実線で描く
        const rankChanged = !hasFewerGames && last.rank !== currentRank
        const solidPts = rankChanged
          ? [...pts.slice(0, -1), { gameNum: last.gameNum, rank: currentRank }]
          : pts
        const polyPts = solidPts.map(p => `${x(p.gameNum)},${y(p.rank)}`).join(' ')
        // ラベル位置: 試合数が少ないチームはlastの位置、それ以外はmaxGames位置
        const labelX = hasFewerGames ? x(last.gameNum) + 5 : x(maxGames) + 5
        const labelY = hasFewerGames ? y(last.rank) + 4 : y(currentRank) + 4
        return (
          <g key={team.id}>
            <polyline
              points={polyPts}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* 試合数が少ないチームのみ点線で延長（ラベルの後ろから） */}
            {hasFewerGames && (() => {
              const dashStartX = x(last.gameNum) + 5 + team.abbr.length * 5.5 + 4
              const maxAbbrLen = Math.max(...groupTeams.filter(t => (history[t.id]?.at(-1)?.gameNum ?? 0) >= maxGames).map(t => t.abbr.length), 3)
              const dashEndX = x(maxGames) + 5 + maxAbbrLen * 5.5
              if (dashStartX >= dashEndX) return null
              return (
                <line
                  x1={dashStartX} y1={y(last.rank)}
                  x2={dashEndX} y2={y(currentRank)}
                  stroke={color}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeDasharray="4 3"
                  opacity="0.4"
                />
              )
            })()}
            <text
              x={labelX}
              y={labelY}
              style={{ fontSize: 9, fill: color, fontFamily: 'inherit', fontWeight: 700 }}
            >
              {team.abbr}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default async function StandingsChart({ group }) {
  const [fixtures, teams] = await Promise.all([getFixtureResults(), getTeams()])
  if (fixtures.length === 0) return null

  const { history, maxGames, finalRank } = buildHistory(fixtures, teams)

  return (
    <div>
      <div style={{ padding: '0' }}>
        <LineChart teams={teams} history={history} maxGames={maxGames} finalRank={finalRank} group={group} />
      </div>
    </div>
  )
}
