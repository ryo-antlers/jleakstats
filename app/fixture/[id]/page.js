import sql from '@/lib/db'
import { getRoundNumber, statusMap, formatDateJa } from '@/lib/utils'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { RatingMinutesScatter, DuelScatter, PassAccuracyBar, FixtureRankChart, SeasonAttackRadar, SeasonDefenseRadar, SeasonRatingScatter, SeasonDuelScatter, SeasonPassScatter, SeasonShotScatter } from '@/app/components/FixtureCharts'
import ScorePopup from '@/app/components/ScorePopup'
import RatingsSection from './ratings-section'
import PostsSection from './posts-section'
import MatchTabs from './match-tabs'
import {
  Cloud, CloudRain, CloudSnow, Sun, Home as HomeIcon,
  Thermometer, Droplets,
  Building2, Users, Flag,
  ArrowUpDown, Radio, User,
} from 'lucide-react'

function WeatherIcon({ weather, size = 18, color = '#fff' }) {
  const w = weather ?? ''
  const props = { size, strokeWidth: 1.6, color }
  if (/雪/.test(w)) return <CloudSnow {...props} />
  if (/雨/.test(w)) return <CloudRain {...props} />
  if (/曇/.test(w)) return <Cloud {...props} />
  if (/屋内/.test(w)) return <HomeIcon {...props} />
  if (/晴/.test(w)) return <Sun {...props} />
  return <Cloud {...props} />
}

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
    SELECT DISTINCT ON (fe.elapsed, fe.team_id, fe.type, fe.detail, fe.player_id)
      fe.*,
      tm.name_ja AS team_name,
      pm.name_ja AS player_name_ja,
      pm2.name_ja AS assist_name_ja
    FROM fixture_events fe
    LEFT JOIN teams_master tm ON fe.team_id = tm.id
    LEFT JOIN players_master pm ON fe.player_id = pm.id
    LEFT JOIN players_master pm2 ON fe.assist_id = pm2.id
    WHERE fe.fixture_id = ${fixtureId}
    ORDER BY fe.elapsed, fe.team_id, fe.type, fe.detail, fe.player_id ASC
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

function PossessionDonut({ homeVal, awayVal, homeColor, awayColor }) {
  // homeVal / awayVal は "55%" のような文字列で渡ってくる前提
  const homeNum = parseFloat(homeVal) || 0
  const awayNum = parseFloat(awayVal) || 0
  const total = homeNum + awayNum
  const homePct = total > 0 ? (homeNum / total) * 100 : 50
  const awayPct = 100 - homePct

  const size = 200
  const cx = size / 2
  const cy = size / 2
  const R = 80      // 外径
  const r = 66      // 内径 (= 厚み 14px)
  const skewDeg = 5 // 斜めカット角度: StatBarのpolygon skewと同じ感覚
  const gapDeg = 3  // ホーム/アウェイ間のすき間
  // 接合部の slant 方向: 外側は前進・内側は後退 → StatBarと同じ「上が前、下が後ろ」

  function polar(deg, radius) {
    const rad = (deg - 90) * Math.PI / 180
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)]
  }

  function wedge(startDeg, endDeg) {
    // 各セグメントの両端を skew させる:
    //   外側エッジは startDeg/endDeg 通り、内側エッジは -skewDeg ずらす
    //   結果として接合線が「径方向」ではなく斜めになる（StatBarと同じ視覚）
    const innerStartDeg = startDeg - skewDeg
    const innerEndDeg = endDeg - skewDeg
    const [oxs, oys] = polar(startDeg, R)
    const [oxe, oye] = polar(endDeg, R)
    const [ixe, iye] = polar(innerEndDeg, r)
    const [ixs, iys] = polar(innerStartDeg, r)
    const largeArc = (endDeg - startDeg) > 180 ? 1 : 0
    const innerLargeArc = (innerEndDeg - innerStartDeg) > 180 ? 1 : 0
    return `M ${oxs} ${oys} ` +
           `A ${R} ${R} 0 ${largeArc} 1 ${oxe} ${oye} ` +
           `L ${ixe} ${iye} ` +
           `A ${r} ${r} 0 ${innerLargeArc} 0 ${ixs} ${iys} Z`
  }

  // ホームを左回り (上→左→下) に配置するため、アウェイを右(0°→awayEndDeg)、
  // ホームをその後 (awayEndDeg→360°) として描画
  const awayEndDeg = (awayPct / 100) * 360
  const awayPath = wedge(0 + gapDeg / 2, awayEndDeg - gapDeg / 2)
  const homePath = wedge(awayEndDeg + gapDeg / 2, 360 - gapDeg / 2)

  return (
    <div>
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <path d={homePath} fill={homeColor || '#888'} />
          <path d={awayPath} fill={awayColor || '#555'} />
        </svg>
        <div style={{
          position: 'absolute', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          color: '#fff', pointerEvents: 'none',
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#fff', marginBottom: 6,
          }}>ボール支配率</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, lineHeight: 1 }}>
            <span style={{ fontSize: 30, fontWeight: 900, color: homeColor, letterSpacing: '-0.02em' }}>
              {Math.round(homePct)}
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', fontWeight: 400 }}>:</span>
            <span style={{ fontSize: 30, fontWeight: 900, color: awayColor, letterSpacing: '-0.02em' }}>
              {Math.round(awayPct)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// 枠 = ゴール枠の比喩。枠の中=枠内シュート、枠の外=枠外シュート
function ShotsFrame({ onHome, onAway, offHome, offAway, homeColor, awayColor }) {
  const bw = 6 // 枠線の太さ
  return (
    <div>
      {/* シュート数 ラベル + 枠外シュートの数字 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 16, padding: '0 4px',
      }}>
        <span style={{ fontSize: 28, fontWeight: 900, color: homeColor || '#fff', minWidth: 28, lineHeight: 1 }}>{offHome ?? '-'}</span>
        <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, textAlign: 'center' }}>シュート数</span>
        <span style={{ fontSize: 28, fontWeight: 900, color: awayColor || '#fff', minWidth: 28, textAlign: 'right', lineHeight: 1 }}>{offAway ?? '-'}</span>
      </div>
      {/* 枠内シュート (枠の "中"): 太い枠線 + 大きな数字 */}
      <div style={{ display: 'flex', height: 100 }}>
        <div style={{
          flex: 1,
          borderTop: `${bw}px solid ${homeColor || '#888'}`,
          borderBottom: `${bw}px solid ${homeColor || '#888'}`,
          borderLeft: `${bw}px solid ${homeColor || '#888'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 30, fontWeight: 900, color: homeColor || '#fff', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {onHome ?? '-'}
          </span>
        </div>
        <div style={{
          flex: 1,
          borderTop: `${bw}px solid ${awayColor || '#555'}`,
          borderBottom: `${bw}px solid ${awayColor || '#555'}`,
          borderRight: `${bw}px solid ${awayColor || '#555'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 30, fontWeight: 900, color: awayColor || '#fff', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {onAway ?? '-'}
          </span>
        </div>
      </div>
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
  const refereeLimit = 5
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

  // ポジション (GK→DF→MF→FW) → 背番号 順
  const posOrder = { GK: 1, DF: 2, MF: 3, FW: 4 }
  const sortByPosNum = (a, b) => {
    const pa = posOrder[a.position] ?? 5
    const pb = posOrder[b.position] ?? 5
    if (pa !== pb) return pa - pb
    const na = a.number == null ? 999 : Number(a.number)
    const nb = b.number == null ? 999 : Number(b.number)
    return na - nb
  }

  const homeLineup = lineups.filter(p => p.team_id === fixture.home_team_id)
  const awayLineup = lineups.filter(p => p.team_id === fixture.away_team_id)
  const homeStarters = homeLineup.filter(p => p.is_starter).sort(sortByPosNum)
  const homeSubs = homeLineup.filter(p => !p.is_starter).sort(sortByPosNum)
  const awayStarters = awayLineup.filter(p => p.is_starter).sort(sortByPosNum)
  const awaySubs = awayLineup.filter(p => !p.is_starter).sort(sortByPosNum)

  // 交代イベント: player_id=退いた選手, assist_id=入った選手
  const substEvents = events.filter(e => e.type === 'subst')
  // API-football: subst の player_id = 入った選手, assist_id = 退いた選手
  // subOutMap[退いた player_id] = { name: 入った選手名, elapsed }
  // subInMap[入った player_id]  = { name: 退いた選手名, elapsed }
  const subOutMap = {}
  const subInMap = {}
  for (const e of substEvents) {
    if (e.assist_id) subOutMap[e.assist_id] = { name: e.player_name_ja ?? e.player_name_en, elapsed: e.elapsed }
    if (e.player_id) subInMap[e.player_id] = { name: e.assist_name_ja ?? e.assist_name_en, elapsed: e.elapsed }
  }

  // カードmap: player_id → { yellow, red, redElapsed }
  const cardMap = {}
  for (const e of events.filter(e => e.type === 'Card')) {
    if (!e.player_id) continue
    if (!cardMap[e.player_id]) cardMap[e.player_id] = { yellow: 0, red: 0, redElapsed: null }
    if (e.detail === 'Yellow Card') cardMap[e.player_id].yellow++
    if (e.detail === 'Red Card' || e.detail === 'Yellow Red Card') {
      cardMap[e.player_id].red++
      cardMap[e.player_id].redElapsed = e.elapsed
    }
  }

  const dedupeGoals = (goals) => {
    const seen = new Set()
    return goals.filter(e => {
      const name = e.player_name_ja ?? e.player_name_en ?? ''
      const key = `${e.elapsed}-${name}-${e.detail}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  const allHomeGoals = dedupeGoals(events.filter(e => e.team_id === fixture.home_team_id && e.type === 'Goal' && e.detail !== 'Missed Penalty'))
  const allAwayGoals = dedupeGoals(events.filter(e => e.team_id === fixture.away_team_id && e.type === 'Goal' && e.detail !== 'Missed Penalty'))
  // PEN試合はPK戦キッカーを除外（home_score/away_scoreは延長込みの実得点数）
  const homeGoalEvents = fixture.status === 'PEN'
    ? allHomeGoals.slice(0, fixture.home_score ?? allHomeGoals.length)
    : allHomeGoals
  const awayGoalEvents = fixture.status === 'PEN'
    ? allAwayGoals.slice(0, fixture.away_score ?? allAwayGoals.length)
    : allAwayGoals

  const homeColor = fixture.home_color ?? '#444'
  const awayColor = fixture.away_color ?? '#444'

  const homeOdds = odds.filter(o => o.value === 'Home')
  const drawOdds = odds.filter(o => o.value === 'Draw')
  const awayOdds = odds.filter(o => o.value === 'Away')
  const avg = (arr) => arr.length ? (arr.reduce((s, o) => s + parseFloat(o.odd), 0) / arr.length).toFixed(2) : '-'

  const useTabs = (fixture.season ?? 0) >= 2026

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

      {/* カテゴリ・節ラベル（例: J1リーグ 第4節 / 2026.3.7 SAT / 16:03 KO） */}
      {(() => {
        const s = fixture.stage_ja
        let compLabel = null
        if (s === 'J1') compLabel = 'J1リーグ'
        else if (s?.startsWith('J1 ')) compLabel = `J1リーグ ${s.slice(3)}`
        else if (s) compLabel = s
        else if (fixture.league_id === 100) compLabel = 'リーグカップ'
        else if (fixture.league_id === 98) compLabel = '明治安田Ｊ１百年構想'
        else if (fixture.league_id === 1) compLabel = 'J1リーグ'

        const roundLabel = fixture.round_number != null
          ? `第${fixture.round_number}節`
          : (fixture.round && !fixture.round.startsWith('Regular Season') ? fixture.round : null)

        const ko = fixture.date
          ? new Date(fixture.date).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })
          : null
        const hasKO = ko && ko !== '00:00'

        if (!compLabel && !roundLabel && !hasKO) return null

        const d = new Date(fixture.date)
        const jst = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
        const y = jst.getFullYear()
        const m = jst.getMonth() + 1
        const day = jst.getDate()
        const dowEn = ['SUN','MON','TUE','WED','THU','FRI','SAT'][jst.getDay()]
        const dateLabel = `${y}.${m}.${day} ${dowEn}`

        const compRoundLine = [compLabel, roundLabel].filter(Boolean).join(' ')

        return (
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            {compRoundLine && (
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '0.06em', marginBottom: 10 }}>
                {compRoundLine}
              </div>
            )}
            <div style={{ width: 60, height: 1, backgroundColor: 'rgba(255,255,255,0.2)', margin: '0 auto 10px' }} />
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.12em', marginBottom: 4 }}>
              {dateLabel}
            </div>
            {hasKO && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em' }}>
                {ko} KO
              </div>
            )}
          </div>
        )
      })()}

      {/* チーム名（日本語、1行、小さめ） */}
      <div style={{ display: 'flex', marginBottom: 12, alignItems: 'center', maxWidth: 560, margin: '0 auto 12px' }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <Link href={`/team/${fixture.home_team_id}`} style={{ textDecoration: 'none' }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
              {fixture.home_name ?? fixture.home_name_en}
            </span>
          </Link>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <Link href={`/team/${fixture.away_team_id}`} style={{ textDecoration: 'none' }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
              {fixture.away_name ?? fixture.away_name_en}
            </span>
          </Link>
        </div>
      </div>

      {/* スコアタイル（中央寄せ、幅を抑える） */}
      <div style={{ display: 'flex', maxWidth: 560, margin: '0 auto' }}>
        <div style={{ flex: 1, height: hasStarted ? 56 : 32, backgroundColor: homeColor, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {hasStarted && (
            <>
              <span style={{ fontSize: 32, fontWeight: 900, color: textColor(homeColor), lineHeight: 1 }}>
                {fixture.home_score ?? 0}
              </span>
              {fixture.status === 'PEN' && fixture.home_penalty != null && (
                <span style={{ fontSize: 16, fontWeight: 900, color: textColor(homeColor), opacity: 0.7, lineHeight: 1 }}>
                  ({fixture.home_penalty})
                </span>
              )}
            </>
          )}
        </div>
        <div style={{ flex: 1, height: hasStarted ? 56 : 32, backgroundColor: awayColor, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {hasStarted && (
            <>
              {fixture.status === 'PEN' && fixture.away_penalty != null && (
                <span style={{ fontSize: 16, fontWeight: 900, color: textColor(awayColor), opacity: 0.7, lineHeight: 1 }}>
                  ({fixture.away_penalty})
                </span>
              )}
              <span style={{ fontSize: 32, fontWeight: 900, color: textColor(awayColor), lineHeight: 1 }}>
                {fixture.away_score ?? 0}
              </span>
            </>
          )}
        </div>
      </div>

      {/* 監督（スコア箱と同じ幅で両端配置、MANAGERラベル付き） */}
      {(fixture.home_coach_ja || fixture.away_coach_ja) && (
        <div style={{ display: 'flex', maxWidth: 560, margin: '8px auto 4px' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, paddingLeft: 4, color: '#fff' }}>
            {fixture.home_coach_ja && (
              <>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.45)' }}>MANAGER</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <User size={13} strokeWidth={1.6} />
                  <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.02em' }}>{fixture.home_coach_ja}</span>
                </span>
              </>
            )}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, paddingRight: 4, color: '#fff' }}>
            {fixture.away_coach_ja && (
              <>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.45)' }}>MANAGER</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.02em' }}>{fixture.away_coach_ja}</span>
                  <User size={13} strokeWidth={1.6} />
                </span>
              </>
            )}
          </div>
        </div>
      )}
      {!hasStarted && (
        <div style={{ textAlign: 'center', marginTop: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.08em' }}>
            {formatKickoff(fixture.date)}
          </span>
        </div>
      )}

      {/* メタ情報: 1段目 主審/会場/観客, 2段目 天候/気温/湿度, 放送あれば下に */}
      {(fixture.venue_name_ja || fixture.venue_name || fixture.attendance != null || fixture.referee_ja_official || fixture.referee_en
        || fixture.weather || fixture.temperature_c != null || fixture.humidity_pct != null || fixture.broadcast_ja) && (() => {
        const iconColor = 'rgba(255,255,255,0.55)'
        const cellStyle = {
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 5, fontSize: 12, color: '#fff',
        }
        const rowStyle = {
          display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '10px 36px',
        }
        return (
          <div style={{ marginTop: 18, marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 1段目: 主審 / 会場 / 観客 */}
            {((fixture.venue_name_ja || fixture.venue_name) || fixture.attendance != null || fixture.referee_ja_official || fixture.referee_en) && (
              <div style={rowStyle}>
                <span style={cellStyle}>
                  <Flag size={16} strokeWidth={1.5} color={iconColor} />
                  {fixture.referee_ja_official ? (
                    <Link href={`/referee/${encodeURIComponent(fixture.referee_ja_official)}`} style={{ color: '#fff', textDecoration: 'none' }}>
                      {fixture.referee_ja_official}
                    </Link>
                  ) : (
                    <span>{refereeJa ?? fixture.referee_ja ?? fixture.referee_en ?? '—'}</span>
                  )}
                </span>
                <span style={cellStyle}>
                  <Building2 size={16} strokeWidth={1.5} color={iconColor} />
                  <span>{fixture.venue_name_ja ?? fixture.venue_name ?? '—'}</span>
                </span>
                <span style={cellStyle}>
                  <Users size={16} strokeWidth={1.5} color={iconColor} />
                  <span>{fixture.attendance != null ? `${Number(fixture.attendance).toLocaleString()}人` : '—'}</span>
                </span>
              </div>
            )}
            {/* 2段目: 天候 / 気温 / 湿度 */}
            {(fixture.weather || fixture.temperature_c != null || fixture.humidity_pct != null) && (
              <div style={rowStyle}>
                <span style={cellStyle}>
                  <WeatherIcon weather={fixture.weather} size={16} color={iconColor} />
                  <span>{fixture.weather ?? '—'}</span>
                </span>
                <span style={cellStyle}>
                  <Thermometer size={16} strokeWidth={1.5} color={iconColor} />
                  <span>{fixture.temperature_c != null ? `${fixture.temperature_c}℃` : '—'}</span>
                </span>
                <span style={cellStyle}>
                  <Droplets size={16} strokeWidth={1.5} color={iconColor} />
                  <span>{fixture.humidity_pct != null ? `${fixture.humidity_pct}%` : '—'}</span>
                </span>
              </div>
            )}
            {/* 放送（あれば） */}
            {fixture.broadcast_ja && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <span style={cellStyle}>
                  <Radio size={16} strokeWidth={1.5} color={iconColor} />
                  <span>{fixture.broadcast_ja}</span>
                </span>
              </div>
            )}
          </div>
        )
      })()}

      {/* 試合イベントタイムライン (Goal/Yellow/Red/Sub、時系列) + KO/HT/FT マーカー */}
      {(() => {
        const tlEvents = events
          .filter(e => e.type === 'Goal'
            || (e.type === 'Card' && (e.detail === 'Yellow Card' || e.detail === 'Red Card' || e.detail === 'Yellow Red Card'))
            || e.type === 'subst')
          .sort((a, b) => (a.elapsed ?? 0) - (b.elapsed ?? 0))

        if (tlEvents.length === 0 && !hasStarted) return null

        const items = []
        items.push({ type: 'marker', label: 'KICK OFF' })
        let htInserted = false
        for (const e of tlEvents) {
          if (!htInserted && (e.elapsed ?? 0) >= 46) {
            items.push({ type: 'marker', label: 'HALF TIME' })
            htInserted = true
          }
          items.push({ type: 'event', e })
        }
        if (!htInserted) items.push({ type: 'marker', label: 'HALF TIME' })
        if (isFinished) items.push({ type: 'marker', label: 'FULL TIME' })

        const Marker = ({ label }) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, marginBottom: 6 }}>
            <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.55)' }}>{label}</span>
            <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
          </div>
        )

        return (
          <section style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((it, i) => {
                if (it.type === 'marker') return <Marker key={i} label={it.label} />
                const e = it.e
                const isHome = Number(e.team_id) === Number(fixture.home_team_id)
                const sideColor = isHome ? homeColor : awayColor
                const isGoal = e.type === 'Goal'
                const isSubst = e.type === 'subst'
                const isYellow = e.type === 'Card' && e.detail === 'Yellow Card'
                const isYellowRed = e.type === 'Card' && e.detail === 'Yellow Red Card'
                const isRed = e.type === 'Card' && e.detail === 'Red Card'
                const isOG = isGoal && e.detail === 'Own Goal'
                const isPK = isGoal && e.detail === 'Penalty'

                const playerName = e.player_name_ja ?? e.player_name_en
                const subOutName = e.assist_name_ja ?? e.assist_name_en
                const nameNode = e.player_id
                  ? <Link href={`/player/${e.player_id}`} style={{ color: '#fff', textDecoration: 'none' }}>{playerName}</Link>
                  : <span>{playerName}</span>
                const subOutNode = e.assist_id
                  ? <Link href={`/player/${e.assist_id}`} style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>{subOutName}</Link>
                  : <span style={{ color: 'rgba(255,255,255,0.55)' }}>{subOutName}</span>

                const goalStyle = isGoal ? { fontSize: 14, fontWeight: 800 } : { fontSize: 12, fontWeight: 600 }

                const badge = isGoal ? (
                  <span style={{
                    display: 'inline-block', padding: '2px 6px',
                    backgroundColor: sideColor, color: textColor(sideColor),
                    fontSize: 9, fontWeight: 900, letterSpacing: '0.06em',
                    lineHeight: 1.2, borderRadius: 2,
                    marginRight: isHome ? 6 : 0, marginLeft: isHome ? 0 : 6,
                  }}>GOAL</span>
                ) : isYellow ? (
                  <span style={{ display: 'inline-block', width: 8, height: 11, backgroundColor: '#e9b938', borderRadius: 1, marginRight: isHome ? 0 : 8, marginLeft: isHome ? 8 : 0 }} />
                ) : isYellowRed ? (
                  <span style={{ display: 'inline-flex', gap: 1, marginRight: isHome ? 0 : 8, marginLeft: isHome ? 8 : 0 }}>
                    <span style={{ display: 'inline-block', width: 8, height: 11, backgroundColor: '#e9b938', borderRadius: 1 }} />
                    <span style={{ display: 'inline-block', width: 8, height: 11, backgroundColor: '#e53', borderRadius: 1 }} />
                  </span>
                ) : isRed ? (
                  <span style={{ display: 'inline-block', width: 8, height: 11, backgroundColor: '#e53', borderRadius: 1, marginRight: isHome ? 0 : 8, marginLeft: isHome ? 8 : 0 }} />
                ) : isSubst ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: isHome ? 0 : 6, marginLeft: isHome ? 6 : 0 }}>
                    <ArrowUpDown size={13} strokeWidth={1.6} color="rgba(255,255,255,0.6)" />
                  </span>
                ) : null

                const tag = isOG ? <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginLeft: 4 }}>OG</span>
                          : isPK ? <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginLeft: 4 }}>PK</span>
                          : null

                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', minHeight: 22 }}>
                    <div style={{ flex: 1, textAlign: 'right', paddingRight: 16, color: '#fff' }}>
                      {isHome && (
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                          {isGoal && badge}
                          {isSubst ? (
                            <span style={goalStyle}>
                              {subOutNode}
                              <span style={{ color: 'rgba(255,255,255,0.4)', margin: '0 4px' }}>→</span>
                              {nameNode}
                            </span>
                          ) : (
                            <span style={goalStyle}>{nameNode}{tag}</span>
                          )}
                          {!isGoal && badge}
                        </span>
                      )}
                    </div>
                    <div style={{ width: 38, textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>
                      {e.elapsed}'
                    </div>
                    <div style={{ flex: 1, textAlign: 'left', paddingLeft: 16, color: '#fff' }}>
                      {!isHome && (
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                          {!isGoal && badge}
                          {isSubst ? (
                            <span style={goalStyle}>
                              {nameNode}
                              <span style={{ color: 'rgba(255,255,255,0.4)', margin: '0 4px' }}>←</span>
                              {subOutNode}
                            </span>
                          ) : (
                            <span style={goalStyle}>{nameNode}{tag}</span>
                          )}
                          {isGoal && badge}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })()}


      {(() => {
        // 5タブに振り分け（useTabs: 2026シーズン以降）。!useTabs では従来通り縦並びで表示。
        const gameStatsJsx = isFinished && homeStats && awayStats && (
          <section style={{ marginBottom: 32, paddingTop: 8 }}>
            <p style={{ fontSize: 18, fontWeight: 900, letterSpacing: '0.15em', color: '#fff', textAlign: 'center', marginBottom: 20 }}>GAME STATS</p>
            {/* 上段 2カラム: 左にボール支配率ドーナツ / 右に枠内・枠外シュートのフレーム */}
            <div style={{ display: 'flex', gap: 36, marginBottom: 20, alignItems: 'center', maxWidth: 480, margin: '0 auto 20px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <PossessionDonut homeVal={homeStats.possession} awayVal={awayStats.possession} homeColor={homeColor} awayColor={awayColor} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <ShotsFrame
                  onHome={homeStats.shots_on} onAway={awayStats.shots_on}
                  offHome={homeStats.shots_off} offAway={awayStats.shots_off}
                  homeColor={homeColor} awayColor={awayColor}
                />
              </div>
            </div>
            {homeStats.expected_goals && <StatBar label="ゴール期待値" homeVal={homeStats.expected_goals} awayVal={awayStats.expected_goals} homeColor={homeColor} awayColor={awayColor} />}
            <StatBar label="パス本数" homeVal={homeStats.passes_total} awayVal={awayStats.passes_total} homeColor={homeColor} awayColor={awayColor} />
            <StatBar label="パス成功率" homeVal={homeStats.passes_pct} awayVal={awayStats.passes_pct} homeColor={homeColor} awayColor={awayColor} />
            <StatBar label="コーナーキック" homeVal={homeStats.corners} awayVal={awayStats.corners} homeColor={homeColor} awayColor={awayColor} />
            <StatBar label="ファウル" homeVal={homeStats.fouls} awayVal={awayStats.fouls} homeColor={homeColor} awayColor={awayColor} />
          </section>
        )

        const lineupJsx = (homeStarters.length > 0 || awayStarters.length > 0) ? (
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', position: 'relative' }}>
            {/* 中央区切り線 */}
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.15)' }} />

            {/* ホーム */}
            <div style={{ flex: 1, paddingRight: 16 }}>
              {/* LINE UP ヘッダー */}
              <div style={{ backgroundColor: homeColor, height: 20, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: textColor(homeColor), letterSpacing: '0.12em', lineHeight: 1 }}>LINE UP</span>
              </div>
              {homeStarters.slice(0, 11).map((p, i) => {
                const subOut = subOutMap[p.player_id]
                const card = cardMap[p.player_id]
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', width: 20, textAlign: 'right' }}>{p.position}</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', width: 16, textAlign: 'right' }}>{p.number}</span>
                    <Link href={`/player/${p.player_id}`} style={{ fontSize: 12, color: '#fff', marginLeft: 8, textDecoration: 'none' }}>{p.name_ja ?? p.player_name_en}</Link>
                    {card?.yellow >= 2 && card?.red === 0 && <span style={{ fontSize: 9, backgroundColor: '#e93', borderRadius: 2, padding: '0 3px', marginLeft: 4 }}>YR</span>}
                    {card?.red > 0 && <><span style={{ display: 'inline-block', width: 8, height: 11, backgroundColor: '#e53', borderRadius: 2, marginLeft: 4 }} /><span style={{ fontSize: 9, color: '#e53', marginLeft: 2 }}>▼{card.redElapsed}'</span></>}
                    {subOut && !card?.red && <span style={{ fontSize: 9, color: '#e55', marginLeft: 4 }}>▼{subOut.elapsed}'</span>}
                  </div>
                )
              })}
              {homeSubs.length > 0 && (
                <>
                  <div style={{ backgroundColor: homeColor, height: 20, marginTop: 12, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 900, color: textColor(homeColor), letterSpacing: '0.12em', lineHeight: 1 }}>BENCH</span>
                  </div>
                  {homeSubs.slice(0, 9).map((p, i) => {
                    const subIn = subInMap[p.player_id]
                    const subOut = subOutMap[p.player_id]
                    const card = cardMap[p.player_id]
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', width: 20, textAlign: 'right' }}>{p.position}</span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', width: 16, textAlign: 'right' }}>{p.number}</span>
                        <Link href={`/player/${p.player_id}`} style={{ fontSize: 12, color: '#fff', marginLeft: 8, textDecoration: 'none' }}>{p.name_ja ?? p.player_name_en}</Link>
                        {subIn && <span style={{ fontSize: 9, color: '#5e5', marginLeft: 6 }}>▲{subIn.elapsed}'</span>}
                        {card?.yellow >= 2 && card?.red === 0 && <span style={{ fontSize: 9, backgroundColor: '#e93', borderRadius: 2, padding: '0 3px', marginLeft: 4 }}>YR</span>}
                        {card?.red > 0 && <><span style={{ display: 'inline-block', width: 8, height: 11, backgroundColor: '#e53', borderRadius: 2, marginLeft: 4 }} /><span style={{ fontSize: 9, color: '#e53', marginLeft: 2 }}>▼{card.redElapsed}'</span></>}
                        {subOut && !card?.red && <span style={{ fontSize: 9, color: '#e55', marginLeft: 4 }}>▼{subOut.elapsed}'</span>}
                      </div>
                    )
                  })}
                </>
              )}
            </div>

            {/* アウェイ */}
            <div style={{ flex: 1, paddingLeft: 16 }}>
              {/* LINE UP ヘッダー */}
              <div style={{ backgroundColor: awayColor, height: 20, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: textColor(awayColor), letterSpacing: '0.12em', lineHeight: 1 }}>LINE UP</span>
              </div>
              {awayStarters.slice(0, 11).map((p, i) => {
                const subOut = subOutMap[p.player_id]
                const card = cardMap[p.player_id]
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginBottom: 4 }}>
                    {subOut && !card?.red && <span style={{ fontSize: 9, color: '#e55', marginRight: 4 }}>▼{subOut.elapsed}'</span>}
                    {card?.yellow >= 2 && card?.red === 0 && <span style={{ fontSize: 9, backgroundColor: '#e93', borderRadius: 2, padding: '0 3px' }}>YR</span>}
                    {card?.red > 0 && <><span style={{ fontSize: 9, color: '#e53', marginRight: 2 }}>▼{card.redElapsed}'</span><span style={{ display: 'inline-block', width: 8, height: 11, backgroundColor: '#e53', borderRadius: 2 }} /></>}
                    <Link href={`/player/${p.player_id}`} style={{ fontSize: 12, color: '#fff', marginRight: 8, textDecoration: 'none' }}>{p.name_ja ?? p.player_name_en}</Link>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', width: 16 }}>{p.number}</span>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', width: 20 }}>{p.position}</span>
                  </div>
                )
              })}
              {awaySubs.length > 0 && (
                <>
                  <div style={{ backgroundColor: awayColor, height: 20, marginTop: 12, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 900, color: textColor(awayColor), letterSpacing: '0.12em', lineHeight: 1 }}>BENCH</span>
                  </div>
                  {awaySubs.slice(0, 9).map((p, i) => {
                    const subIn = subInMap[p.player_id]
                    const subOut = subOutMap[p.player_id]
                    const card = cardMap[p.player_id]
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginBottom: 4 }}>
                        {subOut && !card?.red && <span style={{ fontSize: 9, color: '#e55', marginRight: 4 }}>▼{subOut.elapsed}'</span>}
                        {card?.yellow >= 2 && card?.red === 0 && <span style={{ fontSize: 9, backgroundColor: '#e93', borderRadius: 2, padding: '0 3px' }}>YR</span>}
                        {card?.red > 0 && <><span style={{ fontSize: 9, color: '#e53', marginRight: 2 }}>▼{card.redElapsed}'</span><span style={{ display: 'inline-block', width: 8, height: 11, backgroundColor: '#e53', borderRadius: 2 }} /></>}
                        {subIn && <span style={{ fontSize: 9, color: '#5e5', marginRight: 6 }}>▲{subIn.elapsed}'</span>}
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
        ) : null

        const ratingsChartsJsx = (isFinished && playerStats.length > 0) ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 24, alignItems: 'center' }}>
            <div style={{ width: '100%' }}>
              <RatingMinutesScatter playerStats={playerStats} homeTeamId={fixture.home_team_id} awayTeamId={fixture.away_team_id} homeColor={homeColor} awayColor={awayColor} homeScore={fixture.home_score ?? 0} awayScore={fixture.away_score ?? 0} homeShort={fixture.home_short} awayShort={fixture.away_short} />
            </div>
            <div style={{ width: '100%' }}>
              <DuelScatter playerStats={playerStats} homeTeamId={fixture.home_team_id} awayTeamId={fixture.away_team_id} homeColor={homeColor} awayColor={awayColor} homeScore={fixture.home_score ?? 0} awayScore={fixture.away_score ?? 0} />
            </div>
            <div style={{ width: '100%' }}>
              <PassAccuracyBar playerStats={playerStats} homeTeamId={fixture.home_team_id} homeColor={homeColor} awayColor={awayColor} />
            </div>
          </section>
        ) : null

        const refereeHistoryJsx = (homeRefereeHistory.length > 0 || awayRefereeHistory.length > 0) ? (
        <section style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 15, color: '#fff', marginBottom: 12 }}>
            {`主審：${fixture.referee_ja_official ?? refereeJa ?? fixture.referee_en} 直近担当5試合`}
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
        ) : null

        const preMatchGraphsJsx = !hasStarted && seasonFixtures.length > 0 && (
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
        )

        const oddsJsx = !hasStarted && (odds.length > 0 || exactScoreOdds.length > 0) && (() => {
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
        })()

        const fallbackJsx = !hasStarted && odds.length === 0 && seasonFixtures.length === 0 && (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 32 }}>
            試合前のため詳細データはありません
          </p>
        )

        const statsJsx = (
          <>
            {gameStatsJsx}
            {preMatchGraphsJsx}
            {oddsJsx}
            {fallbackJsx}
          </>
        )

        const ratingsJsx = ratingsChartsJsx

        const postsJsx = <PostsSection fixtureId={parseInt(id)} />

        return useTabs ? (
          <MatchTabs
            members={lineupJsx}
            ratings={ratingsJsx}
            stats={statsJsx}
            posts={postsJsx}
            referee={refereeHistoryJsx}
          />
        ) : lineupJsx
      })()}
    </div>
    </>
  )
}
