import sql from '@/lib/db'
import { getRoundNumber, statusMap, formatDateJa } from '@/lib/utils'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { RatingMinutesScatter, DuelScatter, PassAccuracyBar, FixtureRankChart, SeasonAttackRadar, SeasonDefenseRadar, SeasonRatingScatter, SeasonDuelScatter, SeasonPassScatter, SeasonShotScatter } from '@/app/components/FixtureCharts'
import ScorePopup from '@/app/components/ScorePopup'

async function getFixture(id) {
  const rows = await sql`
    SELECT
      f.*,
      ht.name_ja AS home_name, ht.name_en AS home_name_en, ht.short_name AS home_short,
      ht.color_primary AS home_color, ht.group_name AS home_group, ht.abbr AS home_abbr,
      at.name_ja AS away_name, at.name_en AS away_name_en, at.short_name AS away_short,
      at.color_primary AS away_color, at.group_name AS away_group, at.abbr AS away_abbr,
      vm.name_ja AS venue_name
    FROM fixtures f
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    LEFT JOIN venues_master vm ON f.venue_id = vm.id
    WHERE f.id = ${parseInt(id)}
  `
  return rows[0] ?? null
}

async function getSeasonAllFixtures() {
  return await sql`
    SELECT f.round_number, f.home_team_id, f.away_team_id, f.home_score, f.away_score,
           f.home_penalty, f.away_penalty, f.status,
           ht.group_name AS home_group, at.group_name AS away_group
    FROM fixtures f
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    WHERE f.season = 2026 AND f.status IN ('FT', 'AET', 'PEN')
      AND f.round_number IS NOT NULL
    ORDER BY f.round_number ASC
  `.catch(() => [])
}

async function getAllTeams() {
  return await sql`
    SELECT id, abbr, color_primary, group_name
    FROM teams_master WHERE group_name IN ('EAST', 'WEST')
  `.catch(() => [])
}

async function getSeasonTeamStats(homeTeamId, awayTeamId) {
  return await sql`
    SELECT fs.team_id,
      SUM(CAST(fs.shots_total AS numeric)) AS shots_total,
      SUM(CAST(fs.passes_total AS numeric)) AS passes_total,
      SUM(COALESCE(CAST(fs.expected_goals AS numeric), 0)) AS xg,
      SUM(CAST(fs.corners AS numeric)) AS corners_total,
      AVG(CAST(REPLACE(fs.possession, '%', '') AS numeric)) AS avg_possession,
      AVG(CAST(REPLACE(fs.passes_pct, '%', '') AS numeric)) AS avg_passes_pct,
      SUM(COALESCE(CAST(opp.expected_goals AS numeric), 0)) AS xga,
      COUNT(*) AS games
    FROM fixture_statistics fs
    JOIN fixtures f ON fs.fixture_id = f.id
    JOIN fixture_statistics opp ON opp.fixture_id = f.id AND opp.team_id != fs.team_id
    WHERE f.season = 2026
      AND (fs.team_id = ${homeTeamId} OR fs.team_id = ${awayTeamId})
      AND f.status IN ('FT', 'AET', 'PEN')
    GROUP BY fs.team_id
  `.catch(() => [])
}

async function getSeasonPlayerStats(homeTeamId, awayTeamId) {
  return await sql`
    SELECT fps.player_id, fps.team_id,
      MAX(pm.name_ja) AS name_ja,
      MAX(fps.number) AS number,
      MAX(fps.position) AS position,
      AVG(CAST(fps.rating AS numeric)) AS avg_rating,
      SUM(CASE WHEN f.status = 'AET' THEN fps.minutes ELSE LEAST(fps.minutes, 90) END) AS total_minutes,
      SUM(fps.goals) AS total_goals,
      SUM(fps.duels_total) AS total_duels,
      SUM(fps.duels_won) AS total_duels_won,
      SUM(COALESCE(fps.tackles, 0)) AS total_tackles,
      SUM(COALESCE(fps.interceptions, 0)) AS total_interceptions,
      SUM(COALESCE(fps.blocks, 0)) AS total_blocks,
      SUM(COALESCE(fps.passes_total, 0)) AS total_passes,
      SUM(COALESCE(fps.passes_key, 0)) AS total_key_passes,
      SUM(COALESCE(fps.shots_total, 0)) AS total_shots,
      SUM(COALESCE(fps.shots_on, 0)) AS total_shots_on,
      COUNT(DISTINCT fps.fixture_id) AS games_played
    FROM fixture_player_stats fps
    JOIN fixtures f ON fps.fixture_id = f.id
    LEFT JOIN players_master pm ON fps.player_id = pm.id
    WHERE f.season = 2026
      AND (fps.team_id = ${homeTeamId} OR fps.team_id = ${awayTeamId})
      AND f.status IN ('FT', 'AET', 'PEN')
      AND fps.minutes > 0
    GROUP BY fps.player_id, fps.team_id
  `.catch(() => [])
}

async function getRecentForm(homeTeamId, awayTeamId) {
  return await sql`
    SELECT f.id, f.home_team_id, f.away_team_id, f.home_score, f.away_score,
           f.home_penalty, f.away_penalty, f.status,
           f.referee_ja, f.referee_en, f.date,
           ht.name_ja AS home_name, ht.color_primary AS home_color,
           at.name_ja AS away_name, at.color_primary AS away_color
    FROM fixtures f
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    WHERE f.season = 2026 AND f.status IN ('FT', 'AET', 'PEN')
      AND (f.home_team_id = ${homeTeamId} OR f.away_team_id = ${homeTeamId}
           OR f.home_team_id = ${awayTeamId} OR f.away_team_id = ${awayTeamId})
    ORDER BY f.date DESC
    LIMIT 20
  `.catch(() => [])
}

async function getStatistics(fixtureId) {
  const rows = await sql`
    SELECT fs.*, tm.name_ja, tm.color_primary
    FROM fixture_statistics fs
    LEFT JOIN teams_master tm ON fs.team_id = tm.id
    WHERE fs.fixture_id = ${fixtureId}
  `
  return rows
}

async function getEvents(fixtureId) {
  const rows = await sql`
    SELECT fe.*,
      tm.name_ja AS team_name,
      pm.name_ja AS player_name_ja,
      pm2.name_ja AS assist_name_ja
    FROM fixture_events fe
    LEFT JOIN teams_master tm ON fe.team_id = tm.id
    LEFT JOIN players_master pm ON fe.player_id = pm.id
    LEFT JOIN players_master pm2 ON fe.assist_id = pm2.id
    WHERE fe.fixture_id = ${fixtureId}
    ORDER BY fe.elapsed ASC
  `
  return rows
}

async function getPlayerStats(fixtureId) {
  return await sql`
    SELECT fps.*, pm.name_ja, tm.color_primary AS team_color,
      season_total.total_minutes
    FROM fixture_player_stats fps
    LEFT JOIN players_master pm ON fps.player_id = pm.id
    LEFT JOIN teams_master tm ON fps.team_id = tm.id
    LEFT JOIN (
      SELECT fps2.player_id,
        SUM(CASE WHEN f.status = 'AET' THEN fps2.minutes ELSE LEAST(fps2.minutes, 90) END) AS total_minutes
      FROM fixture_player_stats fps2
      JOIN fixtures f ON fps2.fixture_id = f.id
      WHERE f.season = 2026
      GROUP BY fps2.player_id
    ) season_total ON fps.player_id = season_total.player_id
    WHERE fps.fixture_id = ${fixtureId} AND fps.minutes > 0
    ORDER BY fps.rating DESC NULLS LAST
  `.catch(() => [])
}

async function getLineups(fixtureId) {
  const rows = await sql`
    SELECT fl.*, pm.name_ja, tm.color_primary AS team_color
    FROM fixture_lineups fl
    LEFT JOIN players_master pm ON fl.player_id = pm.id
    LEFT JOIN teams_master tm ON fl.team_id = tm.id
    WHERE fl.fixture_id = ${fixtureId}
    ORDER BY fl.team_id, fl.is_starter DESC,
      CASE fl.position WHEN 'G' THEN 1 WHEN 'D' THEN 2 WHEN 'M' THEN 3 WHEN 'F' THEN 4 ELSE 5 END,
      fl.number
  `.catch(() => [])
  return rows
}

async function getOdds(fixtureId) {
  const rows = await sql`
    SELECT * FROM fixture_odds
    WHERE fixture_id = ${fixtureId} AND bet_id = 1
    ORDER BY bookmaker_id ASC
  `.catch(() => [])
  return rows
}

async function getExactScoreOdds(fixtureId) {
  // 各スコアの平均オッズを取得（bet_id=10: Exact Score）
  const rows = await sql`
    SELECT value, AVG(odd::numeric) AS avg_odd, COUNT(*) AS books
    FROM fixture_odds
    WHERE fixture_id = ${fixtureId} AND bet_id = 10
    GROUP BY value
    HAVING COUNT(*) >= 1
    ORDER BY AVG(odd::numeric) ASC
    LIMIT 60
  `.catch(() => [])
  return rows
}


async function getRefereeAliases(refereeEn) {
  if (!refereeEn) return [refereeEn]
  // referee_idが設定されていれば同IDの全name_enを返す、なければ完全一致のみ
  const rows = await sql`
    SELECT rm2.name_en
    FROM referees_master rm1
    JOIN referees_master rm2 ON rm2.referee_id = rm1.referee_id
    WHERE rm1.name_en = ${refereeEn}
      AND rm1.referee_id IS NOT NULL
  `.catch(() => [])
  return rows.length > 0 ? rows.map(r => r.name_en) : [refereeEn]
}

async function getRefereeHistory(refereeEn, teamId, excludeId, limit = 5) {
  if (!refereeEn) return []
  const aliases = await getRefereeAliases(refereeEn)
  const rows = await sql`
    SELECT f.id, f.date, f.home_team_id, f.away_team_id,
           f.home_score, f.away_score, f.home_penalty, f.away_penalty, f.status,
           COALESCE(ht.name_ja, ht.name_en, f.home_team_id::text) AS home_name,
           COALESCE(at.name_ja, at.name_en, f.away_team_id::text) AS away_name,
           (
             SELECT STRING_AGG(
               COALESCE(pm.name_en, fe.player_name_en, '?'), ', '
               ORDER BY fe.elapsed
             )
             FROM fixture_events fe
             LEFT JOIN players_master pm ON fe.player_id = pm.id
             WHERE fe.fixture_id = f.id
               AND fe.team_id = ${teamId}
               AND fe.type = 'Goal'
               AND fe.detail != 'Own Goal'
           ) AS scorers
    FROM fixtures f
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    WHERE f.referee_en = ANY(${aliases})
      AND f.status IN ('FT', 'AET', 'PEN')
      AND f.id != ${excludeId}
      AND (f.home_team_id = ${teamId} OR f.away_team_id = ${teamId})
    ORDER BY f.date DESC
  `.catch(() => [])
  return limit ? rows.slice(0, limit) : rows
}

async function getRefereeJa(refereeEn) {
  if (!refereeEn) return null
  const rows = await sql`
    SELECT rm2.name_ja
    FROM referees_master rm1
    JOIN referees_master rm2 ON rm2.referee_id = rm1.referee_id
    WHERE rm1.name_en = ${refereeEn}
      AND rm1.referee_id IS NOT NULL
      AND rm2.name_ja IS NOT NULL
    LIMIT 1
  `.catch(() => [])
  if (rows.length > 0) return rows[0].name_ja
  // referee_id未設定の場合は完全一致
  const fallback = await sql`
    SELECT name_ja FROM referees_master WHERE name_en = ${refereeEn} AND name_ja IS NOT NULL LIMIT 1
  `.catch(() => [])
  return fallback[0]?.name_ja ?? null
}

function buildTeamSeasonStats(teamId, fixtures, teamStatRows, playerStatRows) {
  let goals_for = 0, goals_against = 0, games = 0
  for (const f of fixtures) {
    const h = Number(f.home_team_id), a = Number(f.away_team_id)
    if (h === teamId) { goals_for += Number(f.home_score) || 0; goals_against += Number(f.away_score) || 0; games++ }
    else if (a === teamId) { goals_for += Number(f.away_score) || 0; goals_against += Number(f.home_score) || 0; games++ }
  }
  const ts = teamStatRows.find(s => Number(s.team_id) === teamId)
  const g = games || 1
  const teamPlayers = playerStatRows.filter(p => Number(p.team_id) === teamId)
  const duels_total    = teamPlayers.reduce((s, p) => s + (Number(p.total_duels) || 0), 0)
  const duels_won      = teamPlayers.reduce((s, p) => s + (Number(p.total_duels_won) || 0), 0)
  const total_blocks   = teamPlayers.reduce((s, p) => s + (Number(p.total_blocks) || 0), 0)
  const total_interceptions = teamPlayers.reduce((s, p) => s + (Number(p.total_interceptions) || 0), 0)
  const total_tackles  = teamPlayers.reduce((s, p) => s + (Number(p.total_tackles) || 0), 0)

  // クリーンシート数（失点0の試合）
  let clean_sheets = 0
  for (const f of fixtures) {
    const isHome = Number(f.home_team_id) === teamId
    const isAway = Number(f.away_team_id) === teamId
    if (isHome && Number(f.away_score) === 0) clean_sheets++
    if (isAway && Number(f.home_score) === 0) clean_sheets++
  }

  return {
    games,
    goals_for_per_game: goals_for / g,
    goals_against_per_game: goals_against / g,
    xg_per_game: (Number(ts?.xg) || 0) / g,
    xga_per_game: (Number(ts?.xga) || 0) / g,
    shots_per_game: (Number(ts?.shots_total) || 0) / g,
    passes_per_game: (Number(ts?.passes_total) || 0) / g,
    corners_per_game: (Number(ts?.corners_total) || 0) / g,
    possession: Number(ts?.avg_possession) || 0,
    passes_pct: Number(ts?.avg_passes_pct) || 0,
    duels_per_game: duels_total / g,
    duel_win_rate: duels_total > 0 ? duels_won / duels_total : 0,
    tackles_per_game: total_tackles / g,
    blocks_per_game: total_blocks / g,
    interceptions_per_game: total_interceptions / g,
  }
}

// ---- helpers ----

function formatDateOnly(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short',
  })
}

function formatTimeOnly(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit',
  })
}

function formatKickoff(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const jst = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const month = jst.getMonth() + 1
  const day = jst.getDate()
  const weekday = d.toLocaleString('en-US', { timeZone: 'Asia/Tokyo', weekday: 'short' }).toUpperCase()
  const time = d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })
  return `${month}/${day} ${weekday}  ${time} KO`
}

function textColor(hex) {
  if (!hex) return '#fff'
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return (r*299 + g*587 + b*114) / 1000 > 150 ? '#1a1a1a' : '#fff'
}

const goalDetailLabel = {
  'Normal Goal': 'ゴール', 'Own Goal': 'OG', 'Penalty': 'PK',
}
const cardDetailLabel = {
  'Yellow Card': 'イエロー', 'Red Card': 'レッド', 'Yellow Red Card': '2枚目イエロー',
}

// ---- コンポーネント ----

function RecentFormRow({ f, teamId, align, clubColor }) {
  const id = Number(teamId)
  const isHome = Number(f.home_team_id) === id
  const myScore = isHome ? Number(f.home_score) : Number(f.away_score)
  const oppScore = isHome ? Number(f.away_score) : Number(f.home_score)
  const oppName = isHome ? (f.away_name ?? '?') : (f.home_name ?? '?')
  const oppTeamId = isHome ? f.away_team_id : f.home_team_id
  const isPK = f.status === 'PEN' && f.home_penalty != null && f.away_penalty != null
  const myPK = isPK ? (isHome ? Number(f.home_penalty) : Number(f.away_penalty)) : null
  const oppPK = isPK ? (isHome ? Number(f.away_penalty) : Number(f.home_penalty)) : null
  const result = myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : isPK ? (myPK > oppPK ? 'W' : 'L') : 'D'
  const badgeColor = result === 'W' ? (clubColor ?? '#3d9e50') : '#555'
  const referee = f.referee_ja ?? f.referee_en ?? ''
  const badge = (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 18, height: 18, fontSize: 10, fontWeight: 900, color: '#fff',
      backgroundColor: badgeColor, flexShrink: 0,
    }}>{result}</span>
  )
  const scoreEl = (
    <Link href={`/fixture/${f.id}`} style={{ fontSize: 11, color: '#fff', whiteSpace: 'nowrap', flexShrink: 0, textDecoration: 'none', fontWeight: 700 }}>
      {myScore}–{oppScore}{isPK && align !== 'right' ? ` (PK ${myPK}-${oppPK})` : ''}
    </Link>
  )
  const pkEl = isPK ? (
    <span style={{ fontSize: 11, color: '#fff', whiteSpace: 'nowrap', flexShrink: 0 }}>
      (PK {myPK}-{oppPK})
    </span>
  ) : null
  const sub = referee ? (
    <span style={{ fontSize: 9, fontWeight: 400, color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      主審:{referee}
    </span>
  ) : null

  if (align === 'right') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginBottom: 14, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {pkEl}{scoreEl}
          <Link href={`/team/${oppTeamId}`} style={{ fontSize: 11, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, letterSpacing: '0.05em', textDecoration: 'none' }}>{oppName}</Link>
          {badge}
        </div>
        {sub}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 14, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {badge}
        <Link href={`/team/${oppTeamId}`} style={{ fontSize: 11, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, letterSpacing: '0.05em', textDecoration: 'none' }}>{oppName}</Link>
        {scoreEl}
      </div>
      {sub}
    </div>
  )
}

function RefereeMatchRow({ f, teamId, align, clubColor }) {
  const isHome = Number(f.home_team_id) === Number(teamId)
  const myScore = isHome ? Number(f.home_score) : Number(f.away_score)
  const oppScore = isHome ? Number(f.away_score) : Number(f.home_score)
  const isPK = f.status === 'PEN' && f.home_penalty != null && f.away_penalty != null
  const myPK = isPK ? (isHome ? Number(f.home_penalty) : Number(f.away_penalty)) : null
  const oppPK = isPK ? (isHome ? Number(f.away_penalty) : Number(f.home_penalty)) : null
  const result = myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : isPK ? (myPK > oppPK ? 'W' : 'L') : 'D'
  const oppName = isHome ? f.away_name : f.home_name
  const jst = new Date(new Date(f.date).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const dateStr = `${jst.getFullYear()}/${jst.getMonth() + 1}/${jst.getDate()}`
  const badgeColor = result === 'W' ? clubColor : '#555'
  const scoreStr = `${myScore}-${oppScore}${isPK ? ` (PK ${myPK}-${oppPK})` : ''}`
  const badge = (
    <span style={{
      width: 18, height: 18, borderRadius: 3, backgroundColor: badgeColor,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>{result}</span>
  )

  if (align === 'left') {
    return (
      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        {badge}
        <span style={{ minWidth: 68, fontSize: 10, color: 'rgba(255,255,255,0.8)', flexShrink: 0, whiteSpace: 'nowrap' }}>{dateStr}</span>
        <ScorePopup oppName={oppName} scoreStr={scoreStr} scorers={f.scorers ?? null} align="left" clubColor={clubColor} />
      </div>
    )
  }
  return (
    <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <ScorePopup oppName={oppName} scoreStr={scoreStr} scorers={f.scorers ?? null} align="right" clubColor={clubColor} />
      <span style={{ minWidth: 68, fontSize: 10, color: 'rgba(255,255,255,0.8)', flexShrink: 0, whiteSpace: 'nowrap', textAlign: 'right' }}>{dateStr}</span>
      {badge}
    </div>
  )
}

function StatBar({ label, homeVal, awayVal, homeColor, awayColor }) {
  const homeNum = parseFloat(homeVal) || 0
  const awayNum = parseFloat(awayVal) || 0
  const total = homeNum + awayNum
  const homePct = total > 0 ? (homeNum / total) * 100 : 50
  const skew = 6 // 斜めの角度(px)

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginBottom: 5 }}>
        <span style={{ fontWeight: 900, color: '#fff', minWidth: 40 }}>{homeVal ?? '-'}</span>
        <span style={{ color: '#fff', fontSize: 11, textAlign: 'center' }}>{label}</span>
        <span style={{ fontWeight: 900, color: '#fff', minWidth: 40, textAlign: 'right' }}>{awayVal ?? '-'}</span>
      </div>
      <div style={{ display: 'flex', height: 8, overflow: 'hidden' }}>
        <div style={{
          width: `${homePct}%`,
          backgroundColor: homeColor || '#888',
          clipPath: `polygon(0 0, 100% 0, calc(100% - ${skew}px) 100%, 0 100%)`,
        }} />
        <div style={{
          width: `${100 - homePct}%`,
          backgroundColor: awayColor || '#555',
          clipPath: `polygon(${skew}px 0, 100% 0, 100% 100%, 0 100%)`,
        }} />
      </div>
    </div>
  )
}

export default async function FixturePage({ params }) {
  const { id } = await params
  const fixture = await getFixture(id)
  if (!fixture) notFound()

  const isFinished = ['FT', 'AET', 'PEN'].includes(fixture.status)
  const isLive = ['LIVE', 'HT'].includes(fixture.status)
  const hasStarted = isFinished || isLive

  const [stats, events, lineups, playerStats, odds, exactScoreOdds] = await Promise.all([
    isFinished ? getStatistics(fixture.id) : Promise.resolve([]),
    isFinished ? getEvents(fixture.id) : Promise.resolve([]),
    getLineups(fixture.id),
    isFinished ? getPlayerStats(fixture.id) : Promise.resolve([]),
    getOdds(fixture.id),
    !isFinished ? getExactScoreOdds(fixture.id) : Promise.resolve([]),
  ])

  const hasReferee = !!fixture.referee_en
  const refereeLimit = isFinished ? 5 : null  // 試合前は全件、終了後は5件
  const [homeRefereeHistory, awayRefereeHistory, refereeJa] = hasReferee
    ? await Promise.all([
        getRefereeHistory(fixture.referee_en, fixture.home_team_id, fixture.id, refereeLimit),
        getRefereeHistory(fixture.referee_en, fixture.away_team_id, fixture.id, refereeLimit),
        getRefereeJa(fixture.referee_en),
      ])
    : [[], [], null]

  const [seasonFixtures, allTeams, seasonTeamStats, seasonPlayerStats, recentFormRows] = !hasStarted
    ? await Promise.all([
        getSeasonAllFixtures(),
        getAllTeams(),
        getSeasonTeamStats(fixture.home_team_id, fixture.away_team_id),
        getSeasonPlayerStats(fixture.home_team_id, fixture.away_team_id),
        getRecentForm(fixture.home_team_id, fixture.away_team_id),
      ])
    : [[], [], [], [], []]

  const hid = Number(fixture.home_team_id), aid = Number(fixture.away_team_id)
  const homeRecentForm = recentFormRows.filter(f => Number(f.home_team_id) === hid || Number(f.away_team_id) === hid).slice(0, 5)
  const awayRecentForm = recentFormRows.filter(f => Number(f.home_team_id) === aid || Number(f.away_team_id) === aid).slice(0, 5)

  const homeSeasonStats = !hasStarted
    ? buildTeamSeasonStats(Number(fixture.home_team_id), seasonFixtures, seasonTeamStats, seasonPlayerStats)
    : null
  const awaySeasonStats = !hasStarted
    ? buildTeamSeasonStats(Number(fixture.away_team_id), seasonFixtures, seasonTeamStats, seasonPlayerStats)
    : null

  const homeStats = stats.find(s => s.team_id === fixture.home_team_id)
  const awayStats = stats.find(s => s.team_id === fixture.away_team_id)
  const status = statusMap[fixture.status] ?? fixture.status

  const posMap = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' }
  lineups.forEach(p => { p.position = posMap[p.position] ?? p.position })

  const homeLineup = lineups.filter(p => p.team_id === fixture.home_team_id)
  const awayLineup = lineups.filter(p => p.team_id === fixture.away_team_id)
  const homeStarters = homeLineup.filter(p => p.is_starter)
  const homeSubs = homeLineup.filter(p => !p.is_starter)
  const awayStarters = awayLineup.filter(p => p.is_starter)
  const awaySubs = awayLineup.filter(p => !p.is_starter)

  // 交代イベント: player_id=退いた選手, assist_id=入った選手
  const substEvents = events.filter(e => e.type === 'subst')
  // player_id → {inPlayer, elapsed} のmap
  const subOutMap = {}
  const subInMap = {}
  for (const e of substEvents) {
    if (e.player_id) subOutMap[e.player_id] = { name: e.assist_name_ja ?? e.assist_name_en, elapsed: e.elapsed }
    if (e.assist_id) subInMap[e.assist_id] = { name: e.player_name_ja ?? e.player_name_en, elapsed: e.elapsed }
  }

  const homeGoalEvents = events.filter(e => e.team_id === fixture.home_team_id && e.type === 'Goal')
  const awayGoalEvents = events.filter(e => e.team_id === fixture.away_team_id && e.type === 'Goal')

  const homeColor = fixture.home_color ?? '#444'
  const awayColor = fixture.away_color ?? '#444'

  const homeOdds = odds.filter(o => o.value === 'Home')
  const drawOdds = odds.filter(o => o.value === 'Draw')
  const awayOdds = odds.filter(o => o.value === 'Away')
  const avg = (arr) => arr.length ? (arr.reduce((s, o) => s + parseFloat(o.odd), 0) / arr.length).toFixed(2) : '-'

  return (
    <>
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, height: 48,
      backgroundColor: '#111', borderBottom: '1px solid #222',
      display: 'flex', alignItems: 'center', paddingLeft: 16, zIndex: 100,
    }}>
      <a href="/" style={{ fontSize: 16, fontWeight: 900, color: '#fff', textDecoration: 'none', letterSpacing: '0.05em' }}>
        J.Leak Stats
      </a>
    </header>
    <div style={{ maxWidth: 640, margin: '0 auto', paddingTop: 64 }}>

      {/* チーム名（スコアの上） */}
      <div style={{ display: 'flex', marginBottom: 20, alignItems: 'center' }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <Link href={`/team/${fixture.home_team_id}`} style={{ textDecoration: 'none' }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '0.05em', lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {(fixture.home_name_en ?? fixture.home_name ?? '').replace(/ /g, '\n')}
            </span>
          </Link>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <Link href={`/team/${fixture.away_team_id}`} style={{ textDecoration: 'none' }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '0.05em', lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {(fixture.away_name_en ?? fixture.away_name ?? '').replace(/ /g, '\n')}
            </span>
          </Link>
        </div>
      </div>

      {/* スコアタイル */}
      <div style={{ display: 'flex', marginBottom: 4 }}>
        <div style={{ flex: 1, height: hasStarted ? 90 : 40, backgroundColor: homeColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {hasStarted && (
            <span style={{ fontSize: 60, fontWeight: 900, color: textColor(homeColor), lineHeight: 1 }}>
              {fixture.home_score ?? 0}
            </span>
          )}
        </div>
        <div style={{ flex: 1, height: hasStarted ? 90 : 40, backgroundColor: awayColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {hasStarted && (
            <span style={{ fontSize: 60, fontWeight: 900, color: textColor(awayColor), lineHeight: 1 }}>
              {fixture.away_score ?? 0}
            </span>
          )}
        </div>
      </div>
      {!hasStarted && (
        <div style={{ textAlign: 'center', marginTop: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.08em' }}>
            {formatKickoff(fixture.date)}
          </span>
        </div>
      )}

      {/* 得点者（スコアの下） */}
      <div style={{ display: 'flex', marginBottom: 24, position: 'relative' }}>
        {fixture.referee_en && (
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 8, textAlign: 'center', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.98)' }}>主審: {refereeJa ?? fixture.referee_ja ?? fixture.referee_en}</span>
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, paddingTop: 8 }}>
          {homeGoalEvents.map((e, i) => (
            <span key={i} style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
              {e.elapsed}' {e.player_id ? <Link href={`/player/${e.player_id}`} style={{ color: '#fff', textDecoration: 'none' }}>{e.player_name_ja ?? e.player_name_en}</Link> : (e.player_name_ja ?? e.player_name_en)}
              {e.detail === 'Own Goal' ? <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}> OG</span> : e.detail === 'Penalty' ? <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}> PK</span> : ''}
            </span>
          ))}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, paddingTop: 8 }}>
          {awayGoalEvents.map((e, i) => (
            <span key={i} style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
              {e.detail === 'Own Goal' ? <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>OG </span> : e.detail === 'Penalty' ? <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>PK </span> : ''}
              {e.player_id ? <Link href={`/player/${e.player_id}`} style={{ color: '#fff', textDecoration: 'none' }}>{e.player_name_ja ?? e.player_name_en}</Link> : (e.player_name_ja ?? e.player_name_en)} {e.elapsed}'
            </span>
          ))}
        </div>
      </div>

      {/* PK */}
      {fixture.status === 'PEN' && fixture.home_penalty != null && (
        <p style={{ textAlign: 'center', marginBottom: 24, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
          PK {fixture.home_penalty} - {fixture.away_penalty}
        </p>
      )}

      {/* 試合スタッツ */}
      {isFinished && homeStats && awayStats && (
        <section style={{ marginBottom: 32, paddingTop: 24 }}>
          <p style={{ fontSize: 18, fontWeight: 900, letterSpacing: '0.15em', color: '#fff', textAlign: 'center', marginBottom: 20 }}>GAME STATS</p>
          <StatBar label="スコア" homeVal={fixture.home_score ?? 0} awayVal={fixture.away_score ?? 0} homeColor={homeColor} awayColor={awayColor} />
          <StatBar label="枠内シュート" homeVal={homeStats.shots_on} awayVal={awayStats.shots_on} homeColor={homeColor} awayColor={awayColor} />
          <StatBar label="枠外シュート" homeVal={homeStats.shots_off} awayVal={awayStats.shots_off} homeColor={homeColor} awayColor={awayColor} />
          <StatBar label="PA内シュート" homeVal={homeStats.shots_inside} awayVal={awayStats.shots_inside} homeColor={homeColor} awayColor={awayColor} />
          {homeStats.expected_goals && <StatBar label="ゴール期待値" homeVal={homeStats.expected_goals} awayVal={awayStats.expected_goals} homeColor={homeColor} awayColor={awayColor} />}
          <StatBar label="パス" homeVal={homeStats.passes_total} awayVal={awayStats.passes_total} homeColor={homeColor} awayColor={awayColor} />
          <StatBar label="パス成功率" homeVal={homeStats.passes_pct} awayVal={awayStats.passes_pct} homeColor={homeColor} awayColor={awayColor} />
          <StatBar label="ボール支配率" homeVal={homeStats.possession} awayVal={awayStats.possession} homeColor={homeColor} awayColor={awayColor} />
          <StatBar label="コーナー" homeVal={homeStats.corners} awayVal={awayStats.corners} homeColor={homeColor} awayColor={awayColor} />
          <StatBar label="ファウル" homeVal={homeStats.fouls} awayVal={awayStats.fouls} homeColor={homeColor} awayColor={awayColor} />
          <StatBar label="イエローカード" homeVal={homeStats.yellow_cards} awayVal={awayStats.yellow_cards} homeColor={homeColor} awayColor={awayColor} />
        </section>
      )}

      {/* スタメン＆ベンチ */}
      {(homeStarters.length > 0 || awayStarters.length > 0) && (
        <section style={{ marginBottom: 24, paddingTop: 24 }}>
          <div style={{ display: 'flex', position: 'relative' }}>
            {/* 中央区切り線 */}
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.15)' }} />

            {/* ホーム */}
            <div style={{ flex: 1, paddingRight: 16 }}>
              {/* LINE UP ヘッダー */}
              <div style={{ backgroundColor: homeColor, padding: '4px 8px', marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: textColor(homeColor), letterSpacing: '0.1em' }}>LINE UP</span>
              </div>
              {homeStarters.slice(0, 11).map((p, i) => {
                const subOut = subOutMap[p.player_id]
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', width: 20, textAlign: 'right' }}>{p.position}</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', width: 16, textAlign: 'right' }}>{p.number}</span>
                    <Link href={`/player/${p.player_id}`} style={{ fontSize: 12, color: '#fff', marginLeft: 8, textDecoration: 'none' }}>{p.name_ja ?? p.player_name_en}</Link>
                    {subOut && <span style={{ fontSize: 9, color: '#e55', marginLeft: 8 }}>▼{subOut.elapsed}'</span>}
                  </div>
                )
              })}
              {homeSubs.length > 0 && (
                <>
                  <div style={{ backgroundColor: homeColor, padding: '4px 8px', marginTop: 12, marginBottom: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 900, color: textColor(homeColor), letterSpacing: '0.1em' }}>BENCH</span>
                  </div>
                  {homeSubs.slice(0, 9).map((p, i) => {
                    const subIn = subInMap[p.player_id]
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', width: 20, textAlign: 'right' }}>{p.position}</span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', width: 16, textAlign: 'right' }}>{p.number}</span>
                        <Link href={`/player/${p.player_id}`} style={{ fontSize: 12, color: '#fff', marginLeft: 8, textDecoration: 'none' }}>{p.name_ja ?? p.player_name_en}</Link>
                        {subIn && <span style={{ fontSize: 9, color: '#5e5', marginLeft: 8 }}>▲{subIn.elapsed}'</span>}
                      </div>
                    )
                  })}
                </>
              )}
            </div>

            {/* アウェイ */}
            <div style={{ flex: 1, paddingLeft: 16 }}>
              {/* LINE UP ヘッダー */}
              <div style={{ backgroundColor: awayColor, padding: '4px 8px', marginBottom: 10, textAlign: 'right' }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: textColor(awayColor), letterSpacing: '0.1em' }}>LINE UP</span>
              </div>
              {awayStarters.slice(0, 11).map((p, i) => {
                const subOut = subOutMap[p.player_id]
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginBottom: 4 }}>
                    {subOut && <span style={{ fontSize: 9, color: '#e55', marginRight: 8 }}>▼{subOut.elapsed}'</span>}
                    <Link href={`/player/${p.player_id}`} style={{ fontSize: 12, color: '#fff', marginRight: 8, textDecoration: 'none' }}>{p.name_ja ?? p.player_name_en}</Link>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', width: 16 }}>{p.number}</span>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', width: 20 }}>{p.position}</span>
                  </div>
                )
              })}
              {awaySubs.length > 0 && (
                <>
                  <div style={{ backgroundColor: awayColor, padding: '4px 8px', marginTop: 12, marginBottom: 10, textAlign: 'right' }}>
                    <span style={{ fontSize: 14, fontWeight: 900, color: textColor(awayColor), letterSpacing: '0.1em' }}>BENCH</span>
                  </div>
                  {awaySubs.slice(0, 9).map((p, i) => {
                    const subIn = subInMap[p.player_id]
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginBottom: 4 }}>
                        {subIn && <span style={{ fontSize: 9, color: '#5e5', marginRight: 8 }}>▲{subIn.elapsed}'</span>}
                        <Link href={`/player/${p.player_id}`} style={{ fontSize: 12, color: '#fff', marginRight: 8, textDecoration: 'none' }}>{p.name_ja ?? p.player_name_en}</Link>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', width: 16 }}>{p.number}</span>
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', width: 20 }}>{p.position}</span>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          </div>
        </section>
      )}


      {isFinished && playerStats.length > 0 && (
        <>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 24, alignItems: 'center' }}>
            <div style={{ width: '85%' }}>
              <RatingMinutesScatter playerStats={playerStats} homeTeamId={fixture.home_team_id} awayTeamId={fixture.away_team_id} homeColor={homeColor} awayColor={awayColor} homeScore={fixture.home_score ?? 0} awayScore={fixture.away_score ?? 0} homeShort={fixture.home_short} awayShort={fixture.away_short} />
            </div>
            <div style={{ width: '85%' }}>
              <DuelScatter playerStats={playerStats} homeTeamId={fixture.home_team_id} awayTeamId={fixture.away_team_id} homeColor={homeColor} awayColor={awayColor} homeScore={fixture.home_score ?? 0} awayScore={fixture.away_score ?? 0} />
            </div>
            <div style={{ width: '85%' }}>
              <PassAccuracyBar playerStats={playerStats} homeTeamId={fixture.home_team_id} homeColor={homeColor} awayColor={awayColor} />
            </div>
          </section>
        </>
      )}

      {/* 審判担当履歴 */}
      {(homeRefereeHistory.length > 0 || awayRefereeHistory.length > 0) && (
        <section style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 15, color: '#fff', marginBottom: 12 }}>
            {refereeJa ?? fixture.referee_en}{isFinished ? 'の直近担当5試合' : 'の担当履歴（全件）'}
          </p>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0, borderTop: `1px solid ${homeColor}`, paddingTop: 10 }}>
              {homeRefereeHistory.map((f, i) => (
                <RefereeMatchRow key={i} f={f} teamId={fixture.home_team_id} align="left" clubColor={homeColor} />
              ))}
              {homeRefereeHistory.length === 0 && (
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>データなし</p>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0, borderTop: `1px solid ${awayColor}`, paddingTop: 10 }}>
              {awayRefereeHistory.map((f, i) => (
                <RefereeMatchRow key={i} f={f} teamId={fixture.away_team_id} align="right" clubColor={awayColor} />
              ))}
              {awayRefereeHistory.length === 0 && (
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'right' }}>データなし</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 試合前グラフ */}
      {!hasStarted && seasonFixtures.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 32, marginBottom: 32, alignItems: 'center' }}>
          {/* 順位推移 */}
          <div style={{ width: '100%' }}>
            <FixtureRankChart
              allFixtures={seasonFixtures} allTeams={allTeams}
              homeTeamId={fixture.home_team_id} awayTeamId={fixture.away_team_id}
              homeColor={homeColor} awayColor={awayColor}
              currentRound={fixture.round_number}

            />
          </div>
          {/* レーダーチャート 2列 */}
          {homeSeasonStats?.games > 0 && (
            <div style={{ width: '100%', display: 'flex', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 0 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em' }}>ATTACK</span>
                  <span style={{ fontSize: 10, color: homeColor, fontWeight: 700 }}>● {fixture.home_abbr}</span>
                  <span style={{ fontSize: 10, color: awayColor, fontWeight: 700 }}>● {fixture.away_abbr}</span>
                </div>
                <SeasonAttackRadar homeStats={homeSeasonStats} awayStats={awaySeasonStats} homeColor={homeColor} awayColor={awayColor} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 0 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em' }}>DEFENSE</span>
                  <span style={{ fontSize: 10, color: homeColor, fontWeight: 700 }}>● {fixture.home_abbr}</span>
                  <span style={{ fontSize: 10, color: awayColor, fontWeight: 700 }}>● {fixture.away_abbr}</span>
                </div>
                <SeasonDefenseRadar homeStats={homeSeasonStats} awayStats={awaySeasonStats} homeColor={homeColor} awayColor={awayColor} />
              </div>
            </div>
          )}


          {/* 直近5試合 */}
          {(homeRecentForm.length > 0 || awayRecentForm.length > 0) && (
            <div style={{ width: '100%', display: 'flex', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0, borderTop: `1px solid ${homeColor}`, paddingTop: 14 }}>
                {homeRecentForm.map((f, i) => <RecentFormRow key={i} f={f} teamId={fixture.home_team_id} align="left" clubColor={homeColor} />)}
              </div>
              <div style={{ flex: 1, minWidth: 0, borderTop: `1px solid ${awayColor}`, paddingTop: 14 }}>
                {awayRecentForm.map((f, i) => <RecentFormRow key={i} f={f} teamId={fixture.away_team_id} align="right" clubColor={awayColor} />)}
              </div>
            </div>
          )}
          {/* 散布図 */}
          {seasonPlayerStats.length > 0 && (
            <>
              <div style={{ width: '100%' }}>
                <SeasonRatingScatter players={seasonPlayerStats} homeTeamId={fixture.home_team_id} awayTeamId={fixture.away_team_id} homeColor={homeColor} awayColor={awayColor} />
              </div>
              <div style={{ width: '100%' }}>
                <SeasonDuelScatter players={seasonPlayerStats} homeTeamId={fixture.home_team_id} awayTeamId={fixture.away_team_id} homeColor={homeColor} awayColor={awayColor} />
              </div>
              <div style={{ width: '100%' }}>
                <SeasonPassScatter players={seasonPlayerStats} homeTeamId={fixture.home_team_id} awayTeamId={fixture.away_team_id} homeColor={homeColor} awayColor={awayColor} />
              </div>
              <div style={{ width: '100%' }}>
                <SeasonShotScatter players={seasonPlayerStats} homeTeamId={fixture.home_team_id} awayTeamId={fixture.away_team_id} homeColor={homeColor} awayColor={awayColor} />
              </div>
            </>
          )}
        </section>
      )}

      {/* オッズ情報（試合前） */}
      {!hasStarted && (odds.length > 0 || exactScoreOdds.length > 0) && (() => {
        const homeOdds = odds.filter(o => o.value === 'Home')
        const drawOdds = odds.filter(o => o.value === 'Draw')
        const awayOdds = odds.filter(o => o.value === 'Away')
        const avg = (arr) => arr.length ? arr.reduce((s, o) => s + parseFloat(o.odd), 0) / arr.length : 0
        const hOdds = avg(homeOdds), dOdds = avg(drawOdds), aOdds = avg(awayOdds)
        const hProb = hOdds > 0 ? 1 / hOdds : 0
        const dProb = dOdds > 0 ? 1 / dOdds : 0
        const aProb = aOdds > 0 ? 1 / aOdds : 0
        const total = hProb + dProb + aProb || 1
        const hPct = Math.round(hProb / total * 100)
        const dPct = Math.round(dProb / total * 100)
        const aPct = Math.round(aProb / total * 100)

        // Exact Score: オッズから確率を計算して正規化
        const scoreProbRaw = exactScoreOdds.map(r => ({
          score: r.value,
          prob: 1 / parseFloat(r.avg_odd),
        }))
        const scoreProbs = scoreProbRaw.map(r => ({
          score: r.score,
          odd: parseFloat(exactScoreOdds.find(x => x.value === r.score)?.avg_odd ?? 0).toFixed(1),
        })).slice(0, 20)

        return (
          <section style={{ marginBottom: 32 }}>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 16, letterSpacing: '0.1em' }}>ODDS / BOOKMAKER AVG</p>

            {/* 勝敗予想 */}
            {odds.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>MATCH WINNER</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: homeColor }}>{fixture.home_short} <span style={{ fontSize: 13 }}>{hPct}%</span></span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>DRAW {dPct}%</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: awayColor }}><span style={{ fontSize: 13 }}>{aPct}%</span> {fixture.away_short}</span>
                </div>
                <div style={{ display: 'flex', height: 10, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${hPct}%`, backgroundColor: homeColor }} />
                  <div style={{ width: `${dPct}%`, backgroundColor: '#555' }} />
                  <div style={{ width: `${aPct}%`, backgroundColor: awayColor }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{hOdds.toFixed(2)}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{dOdds.toFixed(2)}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{aOdds.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* スコア予想 */}
            {exactScoreOdds.length > 0 && (
              <div>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>EXACT SCORE ODDS</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
                  {scoreProbs.map((r, i) => {
                    const score = String(r.score).replace(':', '-')
                    const [h, a] = String(r.score).split(':')
                    const isHomeWin = parseInt(h) > parseInt(a)
                    const isAwayWin = parseInt(h) < parseInt(a)
                    const bgColor = isHomeWin ? homeColor : isAwayWin ? awayColor : '#444'
                    const fg = isHomeWin ? textColor(homeColor) : isAwayWin ? textColor(awayColor) : '#fff'
                    return (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontVariantNumeric: 'tabular-nums' }}>#{i + 1}</span>
                        <div style={{
                          backgroundColor: bgColor,
                          borderRadius: 0,
                          padding: '6px 0px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 1,
                          width: '100%',
                        }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: fg, lineHeight: 1 }}>{score}</span>
                          <span style={{ fontSize: 9, color: fg, opacity: 0.75 }}>×{r.odd}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

          </section>
        )
      })()}

      {/* 試合前 */}
      {!hasStarted && odds.length === 0 && seasonFixtures.length === 0 && (
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 32 }}>
          試合前のため詳細データはありません
        </p>
      )}
    </div>
    </>
  )
}
