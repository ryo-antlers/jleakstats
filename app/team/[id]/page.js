import sql from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'

async function getTeam(id) {
  const rows = await sql`
    SELECT tm.*,
      s.rank, s.played, s.win, s.draw, s.lose, s.goals_for, s.goals_against, s.goals_diff, s.points, s.form
    FROM teams_master tm
    LEFT JOIN standings s ON s.team_id = tm.id AND s.season = 2026
    WHERE tm.id = ${id}
  `.catch(() => [])
  return rows[0] ?? null
}

async function getTeamFixtures(teamId) {
  return await sql`
    SELECT f.id, f.date, f.round_number, f.home_team_id, f.away_team_id,
           f.home_score, f.away_score, f.home_penalty, f.away_penalty, f.status,
           f.referee_en,
           ht.name_ja AS home_name, ht.id AS home_id, ht.color_primary AS home_color,
           at.name_ja AS away_name, at.id AS away_id, at.color_primary AS away_color,
           rm.name_ja AS referee_ja
    FROM fixtures f
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    LEFT JOIN referees_master rm ON rm.name_en = f.referee_en AND rm.name_ja IS NOT NULL
    WHERE f.season = 2026
      AND (f.home_team_id = ${teamId} OR f.away_team_id = ${teamId})
    ORDER BY f.date ASC
  `.catch(() => [])
}

async function getGroupFixtures(group) {
  return await sql`
    SELECT f.round_number, f.home_team_id, f.away_team_id,
           f.home_score, f.away_score, f.home_penalty, f.away_penalty, f.status
    FROM fixtures f
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    WHERE f.season = 2026 AND f.status IN ('FT', 'AET', 'PEN')
      AND ht.group_name = ${group} AND at.group_name = ${group}
      AND f.round_number IS NOT NULL
    ORDER BY f.round_number ASC
  `.catch(() => [])
}

async function getGroupTeams(group) {
  return await sql`
    SELECT id, abbr, color_primary FROM teams_master WHERE group_name = ${group}
  `.catch(() => [])
}

async function getAllTeamStats() {
  return await sql`
    SELECT
      fs.team_id,
      SUM(COALESCE(CAST(fs.expected_goals AS numeric), 0)) AS xg,
      AVG(CAST(REPLACE(fs.possession, '%', '') AS numeric)) AS avg_possession,
      f.home_team_id, f.away_team_id, f.home_score, f.away_score,
      SUM(fps.duels_total) AS duels_total,
      SUM(fps.duels_won) AS duels_won
    FROM fixture_statistics fs
    JOIN fixtures f ON fs.fixture_id = f.id
    LEFT JOIN (
      SELECT fixture_id, team_id,
        SUM(duels_total) AS duels_total,
        SUM(duels_won) AS duels_won
      FROM fixture_player_stats
      GROUP BY fixture_id, team_id
    ) fps ON fps.fixture_id = fs.fixture_id AND fps.team_id = fs.team_id
    WHERE f.season = 2026 AND f.status IN ('FT', 'AET', 'PEN')
    GROUP BY fs.team_id, f.home_team_id, f.away_team_id, f.home_score, f.away_score
  `.catch(() => [])
}

async function getLeagueGoalsAndCleanSheets() {
  return await sql`
    SELECT
      t.id AS team_id,
      COALESCE(SUM(CASE WHEN f.home_team_id = t.id THEN f.home_score
                        WHEN f.away_team_id = t.id THEN f.away_score ELSE 0 END), 0) AS goals_for,
      COALESCE(SUM(CASE WHEN f.home_team_id = t.id THEN f.away_score
                        WHEN f.away_team_id = t.id THEN f.home_score ELSE 0 END), 0) AS goals_against,
      COUNT(*) AS games
    FROM teams_master t
    JOIN fixtures f ON (f.home_team_id = t.id OR f.away_team_id = t.id)
      AND f.season = 2026 AND f.status IN ('FT', 'AET', 'PEN')
    WHERE t.group_name IN ('EAST', 'WEST')
    GROUP BY t.id
  `.catch(() => [])
}

async function getLeaguePlayerStats() {
  return await sql`
    SELECT fps.team_id,
      SUM(fps.duels_total) AS duels_total,
      SUM(fps.duels_won) AS duels_won
    FROM fixture_player_stats fps
    JOIN fixtures f ON fps.fixture_id = f.id
    WHERE f.season = 2026 AND f.status IN ('FT', 'AET', 'PEN')
    GROUP BY fps.team_id
  `.catch(() => [])
}

async function getLeagueTeamStatAggregates() {
  return await sql`
    SELECT fs.team_id,
      SUM(COALESCE(CAST(fs.expected_goals AS numeric), 0)) AS xg,
      AVG(CAST(REPLACE(fs.possession, '%', '') AS numeric)) AS avg_possession,
      SUM(COALESCE(CAST(opp.expected_goals AS numeric), 0)) AS xga
    FROM fixture_statistics fs
    JOIN fixtures f ON fs.fixture_id = f.id
    JOIN fixture_statistics opp ON opp.fixture_id = f.id AND opp.team_id != fs.team_id
    WHERE f.season = 2026 AND f.status IN ('FT', 'AET', 'PEN')
    GROUP BY fs.team_id
  `.catch(() => [])
}

async function getTeamPlayerRankings(teamId) {
  return await sql`
    SELECT
      fps.player_id,
      COALESCE(pm.name_ja, pm.name_en) AS name,
      SUM(fps.minutes) AS total_minutes,
      AVG(CAST(fps.rating AS numeric)) FILTER (WHERE fps.rating IS NOT NULL AND fps.rating != '0') AS avg_rating,
      SUM(COALESCE(fps.passes_key, 0)) AS total_key_passes,
      SUM(fps.duels_won) AS total_duels_won,
      SUM(fps.duels_total) AS total_duels_total
    FROM fixture_player_stats fps
    JOIN fixtures f ON fps.fixture_id = f.id
    LEFT JOIN players_master pm ON fps.player_id = pm.id
    WHERE f.season = 2026 AND f.status IN ('FT', 'AET', 'PEN')
      AND fps.team_id = ${teamId} AND fps.minutes > 0
    GROUP BY fps.player_id, pm.name_en, pm.name_ja
    HAVING SUM(fps.minutes) > 0
  `.catch(() => [])
}

function textColor(hex) {
  if (!hex) return '#fff'
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return (r*299 + g*587 + b*114) / 1000 > 150 ? '#1a1a1a' : '#fff'
}

function buildAllHistory(groupFixtures, groupTeams) {
  const teamIds = new Set(groupTeams.map(t => t.id))
  const rounds = [...new Set(groupFixtures.map(f => f.round_number))].sort((a,b) => a-b)
  const points = {}, gd = {}, gf = {}, gameCount = {}
  for (const t of groupTeams) { points[t.id]=0; gd[t.id]=0; gf[t.id]=0; gameCount[t.id]=0 }

  const history = {}
  for (const t of groupTeams) history[t.id] = []

  for (const round of rounds) {
    const roundFixtures = groupFixtures.filter(f => f.round_number === round)
    const playedThisRound = new Set()

    for (const f of roundFixtures) {
      if (f.home_score == null || f.away_score == null) continue
      const h = f.home_team_id, a = f.away_team_id
      if (!teamIds.has(h) || !teamIds.has(a)) continue
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

    const sorted = [...groupTeams].sort((a, b) => {
      const pd = (points[b.id]??0) - (points[a.id]??0)
      if (pd !== 0) return pd
      const gdd = (gd[b.id]??0) - (gd[a.id]??0)
      if (gdd !== 0) return gdd
      return (gf[b.id]??0) - (gf[a.id]??0)
    })
    sorted.forEach((t, i) => {
      if (playedThisRound.has(t.id)) {
        history[t.id].push({ gameNum: gameCount[t.id], rank: i + 1 })
      }
    })
  }

  const maxGames = Math.max(...Object.values(gameCount), 1)
  return { history, maxGames, gameCount }
}

function AllTeamsRankChart({ groupTeams, history, maxGames, focusTeamId, focusColor }) {
  const teamCount = groupTeams.length
  const W = 600, H = 200
  const padL = 8, padR = 12, padT = 16, padB = 24
  const chartW = W - padL - padR
  const chartH = H - padT - padB

  const x = (g) => padL + ((g - 1) / Math.max(maxGames - 1, 1)) * chartW
  const y = (r) => padT + ((r - 1) / (teamCount - 1)) * chartH

  const tickInterval = maxGames <= 10 ? 1 : maxGames <= 20 ? 2 : 5
  const ticks = []
  for (let i = 1; i <= maxGames; i++) { if (i === 1 || i % tickInterval === 0) ticks.push(i) }

  const focusPts = history[focusTeamId] ?? []
  const focusMaxGame = focusPts.length > 0 ? focusPts[focusPts.length - 1].gameNum : 0

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {ticks.map(g => (
        <text key={g} x={x(g)} y={H - 4} textAnchor="middle"
          style={{ fontSize: 8, fill: 'rgba(255,255,255,0.8)', fontFamily: 'inherit' }}>{g}</text>
      ))}
      {/* other teams */}
      {groupTeams.filter(t => t.id !== focusTeamId).map(team => {
        const pts = history[team.id] ?? []
        if (pts.length < 1) return null
        return (
          <polyline key={team.id}
            points={pts.map(p => `${x(p.gameNum)},${y(p.rank)}`).join(' ')}
            fill="none" stroke={team.color_primary ?? '#888'} strokeWidth={1} opacity={0.4}
            strokeLinejoin="round" strokeLinecap="round"
          />
        )
      })}
      {/* focus team */}
      {focusPts.length >= 1 && (
        <polyline
          points={focusPts.map(p => `${x(p.gameNum)},${y(p.rank)}`).join(' ')}
          fill="none" stroke={focusColor} strokeWidth={2.5}
          strokeLinejoin="round" strokeLinecap="round"
        />
      )}
    </svg>
  )
}

function PlayerRankColumn({ label, players, color }) {
  if (players.length === 0) return null
  const max = players[0].val
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: '#fff', letterSpacing: '0.08em', borderLeft: '1px solid rgba(255,255,255,0.5)', borderRight: '1px solid rgba(255,255,255,0.5)', padding: '0 7px', display: 'inline-block' }}>{label}</span>
      </div>
      {players.map((p) => {
        const isTop = p.val === players[0].val
        return (
        <div key={p.player_id} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
            <Link href={`/player/${p.player_id}`} style={{ fontSize: 11, color: '#fff', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
              {p.name}
            </Link>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{p.display}</span>
          </div>
          <div style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${max > 0 ? (p.val / max) * 100 : 0}%`, height: '100%', backgroundColor: isTop ? color : 'rgba(255,255,255,0.3)', borderRadius: 2 }} />
          </div>
        </div>
        )
      })}
    </div>
  )
}

function RankBar({ label, rank, total, color, myVal, avgVal, valSuffix = '' }) {
  if (!rank || !total) return null
  const pct = Math.round(((total - rank) / Math.max(total - 1, 1)) * 100)
  return (
    <div style={{ marginBottom: 16, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.08em' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>
            {rank}<span style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', fontWeight: 400 }}>/{total}</span>
          </span>
          {myVal != null && (
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginLeft: 6 }}>{myVal}{valSuffix}</span>
          )}
        </div>
      </div>
      <div style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 2 }} />
      </div>
      {avgVal != null && (
        <div style={{ marginTop: 3, fontSize: 9, color: 'rgba(255,255,255,0.8)', textAlign: 'right' }}>avg {avgVal}{valSuffix}</div>
      )}
    </div>
  )
}

const Divider = () => (
  <div style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'stretch', margin: '0 4px' }} />
)

export default async function TeamPage({ params }) {
  const { id } = await params
  const teamId = parseInt(id)
  const team = await getTeam(teamId)
  if (!team) notFound()

  const [fixtures, groupFixtures, groupTeams, leagueGoals, leaguePlayerStats, leagueStatAggs, playerRankings] = await Promise.all([
    getTeamFixtures(teamId),
    team.group_name ? getGroupFixtures(team.group_name) : Promise.resolve([]),
    team.group_name ? getGroupTeams(team.group_name) : Promise.resolve([]),
    getLeagueGoalsAndCleanSheets(),
    getLeaguePlayerStats(),
    getLeagueTeamStatAggregates(),
    getTeamPlayerRankings(teamId),
  ])

  const color = team.color_primary ?? '#444'
  const finished = fixtures.filter(f => ['FT','AET','PEN'].includes(f.status))
  const upcoming = fixtures.filter(f => !['FT','AET','PEN'].includes(f.status))

  let pkWins = 0, pkLosses = 0
  for (const f of finished) {
    if (f.status !== 'PEN') continue
    const isHome = Number(f.home_team_id) === teamId
    const myPK = isHome ? Number(f.home_penalty) : Number(f.away_penalty)
    const oppPK = isHome ? Number(f.away_penalty) : Number(f.home_penalty)
    if (myPK > oppPK) pkWins++; else pkLosses++
  }

  const gd = team.goals_diff ?? 0
  const gdStr = gd > 0 ? `+${gd}` : `${gd}`

  const { history, maxGames } = buildAllHistory(groupFixtures, groupTeams)

  // リーグ内ランク計算
  function calcRank(arr, key, higher = true) {
    const sorted = [...arr].sort((a, b) => higher ? Number(b[key]) - Number(a[key]) : Number(a[key]) - Number(b[key]))
    const rank = sorted.findIndex(r => Number(r.team_id) === teamId) + 1
    return { rank: rank || null, total: arr.length }
  }

  function rankWithAvg(arr, valFn, higher = true) {
    const withVal = arr.map(r => ({ team_id: r.team_id, val: valFn(r) })).filter(r => r.val != null)
    const sorted = [...withVal].sort((a, b) => higher ? b.val - a.val : a.val - b.val)
    const rank = sorted.findIndex(r => Number(r.team_id) === teamId) + 1
    const myVal = withVal.find(r => Number(r.team_id) === teamId)?.val ?? null
    const avg = withVal.length > 0 ? withVal.reduce((s, r) => s + r.val, 0) / withVal.length : null
    return { rank: rank || null, total: withVal.length, myVal, avg }
  }

  const goalRank   = rankWithAvg(leagueGoals, r => Number(r.goals_for))
  const gaRank     = rankWithAvg(leagueGoals, r => Number(r.goals_against), false)
  const xgRank     = rankWithAvg(leagueStatAggs, r => Number(r.xg))
  const xgaRank    = rankWithAvg(leagueStatAggs, r => Number(r.xga), false)
  const possRank   = rankWithAvg(leagueStatAggs, r => Number(r.avg_possession))
  const duelRank   = rankWithAvg(leaguePlayerStats, r => Number(r.duels_total) > 0 ? Number(r.duels_won) / Number(r.duels_total) : null)

  const hasTeamStats = leagueGoals.length > 0

  return (
    <div>
      {/* ① クラブ名 → カラー箱 */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: '#fff', marginBottom: 0, letterSpacing: '0.03em' }}>
          {team.name_en ?? team.name_ja}
        </h1>
        <div style={{ backgroundColor: color, height: 6, borderRadius: 2 }} />
      </div>

      {/* ② スタッツ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 36, flexWrap: 'wrap' }}>
        {[
          { label: 'RANK', value: team.rank ?? '-' },
          { label: 'WIN', value: team.win ?? '-' },
          { label: 'PK-W', value: pkWins || '-' },
          { label: 'DRAW', value: team.draw ?? '-' },
          { label: 'PK-L', value: pkLosses || '-' },
          { label: 'LOSE', value: team.lose ?? '-' },
        ].map(({ label, value }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{value}</p>
          </div>
        ))}
        <Divider />
        {[
          { label: 'GF', value: team.goals_for ?? '-' },
          { label: 'GA', value: team.goals_against ?? '-' },
          { label: 'GD', value: gdStr },
        ].map(({ label, value }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{value}</p>
          </div>
        ))}
        <Divider />
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.08em', marginBottom: 2 }}>POINTS</p>
          <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{team.points ?? '-'}</p>
        </div>
      </div>

      {/* ③ 折れ線グラフ（●なし、ラベルなし、延長なし） */}
      {(history[teamId]?.length ?? 0) >= 2 && (
        <div style={{ marginBottom: 36 }}>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.1em', marginBottom: 8 }}>STANDINGS</p>
          <AllTeamsRankChart
            groupTeams={groupTeams}
            history={history}
            maxGames={maxGames}
            focusTeamId={teamId}
            focusColor={color}
          />
        </div>
      )}

      {/* ④ RESULTS（UPCOMINGと同デザイン） */}
      {finished.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.1em', marginBottom: 10 }}>RESULTS</p>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {finished.map(f => {
              const isHome = Number(f.home_team_id) === teamId
              const my = isHome ? Number(f.home_score) : Number(f.away_score)
              const opp = isHome ? Number(f.away_score) : Number(f.home_score)
              const isPK = f.status === 'PEN' && f.home_penalty != null
              const myPK = isPK ? (isHome ? Number(f.home_penalty) : Number(f.away_penalty)) : null
              const oppPK = isPK ? (isHome ? Number(f.away_penalty) : Number(f.home_penalty)) : null
              const result = my > opp ? 'W' : my < opp ? 'L' : isPK ? (myPK > oppPK ? 'W' : 'L') : 'D'
              const badgeColor = result === 'W' ? color : '#444'
              const oppName = isHome ? f.away_name : f.home_name
              const oppId = isHome ? f.away_id : f.home_id
              const oppColor = isHome ? f.away_color : f.home_color
              const scoreStr = `${my}-${opp}${isPK ? ` (PK ${myPK}-${oppPK})` : ''}`
              const d = new Date(f.date)
              const jst = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
              const dateStr = `${jst.getMonth()+1}/${jst.getDate()}`
              const referee = f.referee_ja ?? f.referee_en ?? ''

              return (
                <div key={f.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
                  padding: '7px 4px', borderBottom: '1px solid rgba(255,255,255,0.08)',
                }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: 3, backgroundColor: badgeColor,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0,
                  }}>{result}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', flexShrink: 0, width: 28 }}>R{f.round_number}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', flexShrink: 0, width: 30 }}>{dateStr}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', flexShrink: 0, width: 14 }}>{isHome ? 'H' : 'A'}</span>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: oppColor ?? '#555', flexShrink: 0, display: 'inline-block' }} />
                  <Link href={`/team/${oppId}`} style={{ color: '#fff', textDecoration: 'none', flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                    {oppName}
                  </Link>
                  <Link href={`/fixture/${f.id}`} style={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'none', flexShrink: 0, fontWeight: 700, marginLeft: 4 }}>
                    {scoreStr}
                  </Link>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', flexShrink: 0, marginLeft: 4 }}>{referee}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* UPCOMING */}
      {upcoming.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.1em', marginBottom: 10 }}>UPCOMING</p>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {upcoming.map(f => {
              const isHome = Number(f.home_team_id) === teamId
              const oppName = isHome ? f.away_name : f.home_name
              const oppId = isHome ? f.away_id : f.home_id
              const oppColor = isHome ? f.away_color : f.home_color
              const d = new Date(f.date)
              const jst = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
              const dateStr = `${jst.getMonth()+1}/${jst.getDate()}`
              return (
                <div key={f.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
                  padding: '7px 4px', borderBottom: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.5)',
                }}>
                  <span style={{ width: 18, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', flexShrink: 0, width: 28 }}>R{f.round_number}</span>
                  <span style={{ fontSize: 10, flexShrink: 0, width: 30 }}>{dateStr}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', flexShrink: 0, width: 14 }}>{isHome ? 'H' : 'A'}</span>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: oppColor ?? '#555', flexShrink: 0, display: 'inline-block' }} />
                  <Link href={`/team/${oppId}`} style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>{oppName}</Link>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* チームスタッツランキング */}
      {hasTeamStats && (
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.1em', marginBottom: 16 }}>TEAM STATS RANKING</p>
          <RankBar label="GOALS" rank={goalRank.rank} total={goalRank.total} color={color}
            myVal={goalRank.myVal} avgVal={goalRank.avg != null ? goalRank.avg.toFixed(1) : null} />
          <RankBar label="xG" rank={xgRank.rank} total={xgRank.total} color={color}
            myVal={xgRank.myVal != null ? xgRank.myVal.toFixed(1) : null} avgVal={xgRank.avg != null ? xgRank.avg.toFixed(1) : null} />
          <RankBar label="GOALS AGAINST" rank={gaRank.rank} total={gaRank.total} color={color}
            myVal={gaRank.myVal} avgVal={gaRank.avg != null ? gaRank.avg.toFixed(1) : null} />
          <RankBar label="xGA" rank={xgaRank.rank} total={xgaRank.total} color={color}
            myVal={xgaRank.myVal != null ? xgaRank.myVal.toFixed(1) : null} avgVal={xgaRank.avg != null ? xgaRank.avg.toFixed(1) : null} />
          <RankBar label="POSSESSION" rank={possRank.rank} total={possRank.total} color={color}
            myVal={possRank.myVal != null ? possRank.myVal.toFixed(1) : null} avgVal={null} valSuffix="%" />
          <RankBar label="DUEL WIN %" rank={duelRank.rank} total={duelRank.total} color={color}
            myVal={duelRank.myVal != null ? (duelRank.myVal * 100).toFixed(1) : null} avgVal={null} valSuffix="%" />
        </div>
      )}

      {/* 選手ランキング */}
      {playerRankings.length > 0 && (() => {
        const top5 = (arr) => arr.slice(0, 5)
        const minutesPlayers = top5([...playerRankings].sort((a, b) => Number(b.total_minutes) - Number(a.total_minutes)).map(p => ({ ...p, val: Number(p.total_minutes), display: `${Number(p.total_minutes)}'` })))
        const ratingPlayers = top5([...playerRankings].filter(p => p.avg_rating).sort((a, b) => Number(b.avg_rating) - Number(a.avg_rating)).map(p => ({ ...p, val: Number(p.avg_rating), display: parseFloat(p.avg_rating).toFixed(2) })))
        const keyPassPlayers = top5([...playerRankings].sort((a, b) => Number(b.total_key_passes) - Number(a.total_key_passes)).map(p => ({ ...p, val: Number(p.total_key_passes), display: `${Number(p.total_key_passes)}` })))
        const duelPlayers = top5([...playerRankings].filter(p => Number(p.total_duels_total) >= 10).sort((a, b) => (Number(b.total_duels_won) / Number(b.total_duels_total)) - (Number(a.total_duels_won) / Number(a.total_duels_total))).map(p => ({ ...p, val: Number(p.total_duels_won) / Number(p.total_duels_total), display: `${(Number(p.total_duels_won) / Number(p.total_duels_total) * 100).toFixed(1)}%` })))
        return (
          <div style={{ marginBottom: 40 }}>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.1em', marginBottom: 16 }}>PLAYER RANKING</p>
            <div style={{ display: 'flex', gap: 24, marginBottom: 28 }}>
              <PlayerRankColumn label="MINUTES" players={minutesPlayers} color={color} />
              <PlayerRankColumn label="RATING" players={ratingPlayers} color={color} />
            </div>
            <div style={{ display: 'flex', gap: 24 }}>
              <PlayerRankColumn label="KEY PASSES" players={keyPassPlayers} color={color} />
              <PlayerRankColumn label="DUEL WIN %" players={duelPlayers} color={color} />
            </div>
          </div>
        )
      })()}
    </div>
  )
}
