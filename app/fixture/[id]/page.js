import sql from '@/lib/db'
import { getRoundNumber, statusMap, formatDateJa } from '@/lib/utils'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { RatingMinutesScatter, DuelScatter, PassAccuracyBar, PlayerRankingBar, FixtureRankChart, SeasonAttackRadar, SeasonDefenseRadar, SeasonRatingScatter, SeasonDuelScatter, SeasonPassScatter, SeasonShotScatter } from '@/app/components/FixtureCharts'
import RatingsSection from './ratings-section'
import PostsSection from './posts-section'
import MatchTabs from './match-tabs'
import RefereeSection from './referee-section'
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
  // J1 (EAST/WEST) と J2J3 (EAST-A/EAST-B/WEST-A/WEST-B) の全グループを返す
  return await sql`
    SELECT id, abbr, color_primary, group_name
    FROM teams_master WHERE group_name IS NOT NULL
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
           f.home_penalty, f.away_penalty, f.status, f.league_id,
           f.referee_ja, f.referee_en, f.referee_ja_official, f.date,
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

// 現スカッド選手が対戦相手相手に通算で奪ったゴールランキング (在籍クラブ別の内訳付き)
// 「2026年シーズンに現クラブの試合に出場した選手」を対象にし、
// 過去他クラブ在籍時のものも含めて vs 対戦相手戦の全ゴールを集計 (PK戦・OG除外)
//
// 名寄せ: canonical_id (= COALESCE(canonical_id, id)) で集約。
//   - 移籍前後の別 player_id (レオセアラ 9550=鹿島, 9000365=C大阪) は同一 canonical に統合済 (Phase 2)
//   - 同姓同名 (東京VマテウスGK vs 名古屋マテウスFW) は別 canonical に分離済 (Phase 2)
async function getGoalsVsOpponent(currentSquadTeamId, opponentTeamId, season = 2026) {
  return await sql`
    WITH current_squad_canonicals AS (
      SELECT
        COALESCE(pm.canonical_id, pm.id) AS canonical_id,
        MIN(fl.number) AS jersey_number
      FROM fixture_lineups fl
      JOIN fixtures f ON fl.fixture_id = f.id
      JOIN players_master pm ON fl.player_id = pm.id
      WHERE fl.team_id = ${currentSquadTeamId}
        AND f.season = ${season}
      GROUP BY COALESCE(pm.canonical_id, pm.id)
    ),
    goal_breakdown AS (
      SELECT
        COALESCE(pm.canonical_id, pm.id) AS canonical_id,
        fe.team_id AS scoring_team_id,
        tm.short_name AS team_short,
        tm.name_ja AS team_name,
        tm.color_primary AS team_color,
        COUNT(*)::int AS goals
      FROM fixture_events fe
      JOIN fixtures f ON fe.fixture_id = f.id
      JOIN players_master pm ON fe.player_id = pm.id
      JOIN current_squad_canonicals csc ON COALESCE(pm.canonical_id, pm.id) = csc.canonical_id
      JOIN teams_master tm ON fe.team_id = tm.id
      WHERE fe.type = 'Goal'
        AND (fe.detail IS DISTINCT FROM 'Own Goal')
        AND (
          (f.home_team_id = ${opponentTeamId} AND fe.team_id = f.away_team_id)
          OR (f.away_team_id = ${opponentTeamId} AND fe.team_id = f.home_team_id)
        )
        AND fe.player_id IS NOT NULL
      GROUP BY COALESCE(pm.canonical_id, pm.id), fe.team_id, tm.short_name, tm.name_ja, tm.color_primary
    )
    SELECT
      cpm.name_ja AS player_name,
      gb.canonical_id AS player_id,
      csc.jersey_number AS jersey,
      SUM(gb.goals)::int AS goals,
      JSON_AGG(
        JSON_BUILD_OBJECT(
          'team_id', gb.scoring_team_id,
          'team_short', gb.team_short,
          'team_name', gb.team_name,
          'team_color', gb.team_color,
          'goals', gb.goals
        ) ORDER BY gb.goals DESC, gb.team_short
      ) AS breakdown
    FROM goal_breakdown gb
    JOIN current_squad_canonicals csc ON csc.canonical_id = gb.canonical_id
    JOIN players_master cpm ON cpm.id = gb.canonical_id
    GROUP BY gb.canonical_id, cpm.name_ja, csc.jersey_number
    ORDER BY goals DESC, csc.jersey_number ASC NULLS LAST, cpm.name_ja
    LIMIT 10
  `.catch(() => [])
}

// 各チームに関わる過去全試合 (FT/AET/PEN) を取得 → JSで状況別集計
async function getTeamHistory(teamA, teamB) {
  return await sql`
    SELECT f.id, f.date, f.season, f.home_team_id, f.away_team_id,
           f.home_score, f.away_score, f.home_penalty, f.away_penalty, f.status,
           ht.name_ja AS home_name, at.name_ja AS away_name
    FROM fixtures f
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    WHERE f.status IN ('FT','AET','PEN')
      AND (f.home_team_id = ${teamA} OR f.away_team_id = ${teamA}
        OR f.home_team_id = ${teamB} OR f.away_team_id = ${teamB})
  `.catch(() => [])
}

// H2H: 両チーム間の過去対戦を全件 (通算成績集計用) + 直近N件詳細
async function getH2H(teamA, teamB) {
  return await sql`
    SELECT f.id, f.date, f.season, f.league_id, f.status,
           f.home_team_id, f.away_team_id,
           f.home_score, f.away_score, f.home_penalty, f.away_penalty,
           ht.name_ja AS home_name, ht.color_primary AS home_color, ht.abbr AS home_abbr,
           at.name_ja AS away_name, at.color_primary AS away_color, at.abbr AS away_abbr
    FROM fixtures f
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    WHERE f.status IN ('FT', 'AET', 'PEN')
      AND ((f.home_team_id = ${teamA} AND f.away_team_id = ${teamB})
        OR (f.home_team_id = ${teamB} AND f.away_team_id = ${teamA}))
    ORDER BY f.date DESC
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

async function getRefereeHistory(refereeJaOfficial, teamId, excludeId, limit = 5) {
  if (!refereeJaOfficial) return []
  const rows = await sql`
    SELECT f.id, f.date, f.league_id, f.home_team_id, f.away_team_id,
           f.home_score, f.away_score, f.home_penalty, f.away_penalty, f.status,
           COALESCE(ht.name_ja, ht.name_en, f.home_team_id::text) AS home_name,
           COALESCE(at.name_ja, at.name_en, f.away_team_id::text) AS away_name,
           (
             SELECT JSON_AGG(g ORDER BY g.elapsed)
             FROM (
               SELECT
                 COALESCE(fe.player_name_ja, pm.name_ja, pm.name_en, fe.player_name_en, '?') AS name,
                 fe.elapsed,
                 fl.position,
                 fl.number
               FROM fixture_events fe
               LEFT JOIN players_master pm ON fe.player_id = pm.id
               LEFT JOIN fixture_lineups fl ON fl.fixture_id = fe.fixture_id AND fl.player_id = fe.player_id
               WHERE fe.fixture_id = f.id
                 AND fe.team_id = ${teamId}
                 AND fe.type = 'Goal'
                 AND fe.detail != 'Own Goal'
             ) g
           ) AS scorers
    FROM fixtures f
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    WHERE f.referee_ja_official = ${refereeJaOfficial}
      AND f.status IN ('FT', 'AET', 'PEN')
      AND f.id != ${excludeId}
      AND (f.home_team_id = ${teamId} OR f.away_team_id = ${teamId})
    ORDER BY f.date DESC
    LIMIT ${limit}
  `.catch(() => [])
  return rows
}

async function getRefereeTeamRecord(refereeJaOfficial, teamId) {
  if (!refereeJaOfficial) return { w: 0, d: 0, l: 0, total: 0 }
  const rows = await sql`
    SELECT
      SUM(CASE
        WHEN (home_team_id = ${teamId} AND home_score > away_score)
          OR (away_team_id = ${teamId} AND away_score > home_score)
          OR (status='PEN' AND home_team_id = ${teamId} AND home_penalty > away_penalty)
          OR (status='PEN' AND away_team_id = ${teamId} AND away_penalty > home_penalty)
        THEN 1 ELSE 0 END) AS w,
      SUM(CASE WHEN home_score = away_score AND status != 'PEN' THEN 1 ELSE 0 END) AS d,
      SUM(CASE
        WHEN (home_team_id = ${teamId} AND home_score < away_score)
          OR (away_team_id = ${teamId} AND away_score < home_score)
          OR (status='PEN' AND home_team_id = ${teamId} AND home_penalty < away_penalty)
          OR (status='PEN' AND away_team_id = ${teamId} AND away_penalty < home_penalty)
        THEN 1 ELSE 0 END) AS l,
      COUNT(*) AS total
    FROM fixtures
    WHERE referee_ja_official = ${refereeJaOfficial}
      AND status IN ('FT','AET','PEN')
      AND (home_team_id = ${teamId} OR away_team_id = ${teamId})
  `.catch(() => [])
  const r = rows[0] ?? {}
  return { w: Number(r.w) || 0, d: Number(r.d) || 0, l: Number(r.l) || 0, total: Number(r.total) || 0 }
}

async function getRefereeTeamFirstMatch(refereeJaOfficial, teamId) {
  if (!refereeJaOfficial) return null
  const rows = await sql`
    SELECT f.id, f.date, f.home_team_id, f.away_team_id,
           f.home_score, f.away_score, f.home_penalty, f.away_penalty, f.status,
           COALESCE(ht.name_ja, ht.name_en, f.home_team_id::text) AS home_name,
           COALESCE(at.name_ja, at.name_en, f.away_team_id::text) AS away_name,
           (
             SELECT JSON_AGG(g ORDER BY g.elapsed)
             FROM (
               SELECT
                 COALESCE(fe.player_name_ja, pm.name_ja, pm.name_en, fe.player_name_en, '?') AS name,
                 fe.elapsed,
                 fl.position,
                 fl.number
               FROM fixture_events fe
               LEFT JOIN players_master pm ON fe.player_id = pm.id
               LEFT JOIN fixture_lineups fl ON fl.fixture_id = fe.fixture_id AND fl.player_id = fe.player_id
               WHERE fe.fixture_id = f.id
                 AND fe.team_id = ${teamId}
                 AND fe.type = 'Goal'
                 AND fe.detail != 'Own Goal'
             ) g
           ) AS scorers
    FROM fixtures f
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    WHERE f.referee_ja_official = ${refereeJaOfficial}
      AND f.status IN ('FT','AET','PEN')
      AND (f.home_team_id = ${teamId} OR f.away_team_id = ${teamId})
    ORDER BY f.date ASC
    LIMIT 1
  `.catch(() => [])
  return rows[0] ?? null
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
  const r = 74      // 内径 (= 厚み 6px、シュート枠の borderWidth と同じ)
  const skewDeg = 0 // 斜めカット無し (普通の接合)
  const gapDeg = 0  // すき間無し

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
  // J公式記録の取込完了フラグ。true でメンバー / タイムライン / 審判を解禁
  const hasJLeagueRecord = fixture.data_source === 'j-league'
  // J2J3 (league_id=2): API-Footballデータがないので試合スタッツ・選手スタッツ・レーダーは出さない
  const isJ2J3 = Number(fixture.league_id) === 2

  const [stats, events, lineups, playerStats, odds, exactScoreOdds] = await Promise.all([
    isFinished ? getStatistics(fixture.id) : Promise.resolve([]),
    isFinished ? getEvents(fixture.id) : Promise.resolve([]),
    getLineups(fixture.id),
    isFinished ? getPlayerStats(fixture.id) : Promise.resolve([]),
    getOdds(fixture.id),
    !isFinished ? getExactScoreOdds(fixture.id) : Promise.resolve([]),
  ])

  // 審判キー: 公式記録 (referee_ja_official) > 試合前スクレイプ (referee_ja) の優先順位
  // 試合前 referee_ja は J.League ajax_live.json から取得した日本語フルネーム (半角空白区切り)、
  // referee_ja_official と同じフォーマットなので getRefereeHistory 等で同じキーとして使える
  const refereeKey = fixture.referee_ja_official ?? fixture.referee_ja ?? null
  const hasReferee = !!refereeKey
  // 試合前審判発表済 (公式記録未取込)
  const isPreMatchRefereeAnnounced = !hasStarted && !!fixture.referee_ja && !fixture.referee_ja_official
  const refereeLimit = 5
  const [homeRefereeHistory, awayRefereeHistory, homeRefereeRecord, awayRefereeRecord, homeRefereeFirst, awayRefereeFirst, refereeJa] = hasReferee
    ? await Promise.all([
        getRefereeHistory(refereeKey, fixture.home_team_id, fixture.id, refereeLimit),
        getRefereeHistory(refereeKey, fixture.away_team_id, fixture.id, refereeLimit),
        getRefereeTeamRecord(refereeKey, fixture.home_team_id),
        getRefereeTeamRecord(refereeKey, fixture.away_team_id),
        getRefereeTeamFirstMatch(refereeKey, fixture.home_team_id),
        getRefereeTeamFirstMatch(refereeKey, fixture.away_team_id),
        fixture.referee_en ? getRefereeJa(fixture.referee_en) : Promise.resolve(null),
      ])
    : [[], [], { w:0, d:0, l:0, total:0 }, { w:0, d:0, l:0, total:0 }, null, null, null]

  const [seasonFixtures, allTeams, seasonTeamStats, seasonPlayerStats, recentFormRows, h2hRows, teamHistory, homeGoalsVsAway, awayGoalsVsHome] = !hasStarted
    ? await Promise.all([
        getSeasonAllFixtures(),
        getAllTeams(),
        getSeasonTeamStats(fixture.home_team_id, fixture.away_team_id),
        getSeasonPlayerStats(fixture.home_team_id, fixture.away_team_id),
        getRecentForm(fixture.home_team_id, fixture.away_team_id),
        getH2H(fixture.home_team_id, fixture.away_team_id),
        getTeamHistory(fixture.home_team_id, fixture.away_team_id),
        getGoalsVsOpponent(fixture.home_team_id, fixture.away_team_id),
        getGoalsVsOpponent(fixture.away_team_id, fixture.home_team_id),
      ])
    : [[], [], [], [], [], [], [], [], []]

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
    <div style={{ maxWidth: 640, margin: '0 auto', paddingTop: 18 }}>

      {/* サイトロゴ (中央寄せ、トップへ戻る) */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
        <Link href="/" aria-label="トップへ" style={{ display: 'inline-block', lineHeight: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/apple-icon.png"
            alt="J.Leak Stats"
            width={36}
            height={36}
            style={{ display: 'block', borderRadius: 8 }}
          />
        </Link>
      </div>

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

      {/* メタ情報: 1段目 主審/会場/観客, 2段目 天候/気温/湿度, 放送あれば下に */}
      {/* 主審: 公式記録取込後は referee_ja_official、試合前は referee_ja (J.League公式から事前取得) */}
      {(fixture.venue_name_ja || fixture.venue_name || fixture.attendance != null || fixture.referee_ja_official || fixture.referee_ja
        || fixture.weather || fixture.temperature_c != null || fixture.humidity_pct != null || fixture.broadcast_ja) && (() => {
        const iconColor = 'rgba(255,255,255,0.55)'
        const cellStyle = {
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 5, fontSize: 12, color: '#fff',
        }
        const rowStyle = {
          display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '10px 36px',
        }
        const refereeName = fixture.referee_ja_official ?? fixture.referee_ja ?? null
        return (
          <div style={{ marginTop: 18, marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 1段目: 主審 / 会場 / 観客 */}
            {((fixture.venue_name_ja || fixture.venue_name) || fixture.attendance != null || refereeName) && (
              <div style={rowStyle}>
                {refereeName && (
                  <span style={cellStyle}>
                    <Flag size={16} strokeWidth={1.5} color={iconColor} />
                    {fixture.referee_ja_official ? (
                      <Link href={`/referee/${encodeURIComponent(fixture.referee_ja_official)}`} style={{ color: '#fff', textDecoration: 'none' }}>
                        {fixture.referee_ja_official}
                      </Link>
                    ) : (
                      <span>{refereeName}</span>
                    )}
                  </span>
                )}
                <span style={cellStyle}>
                  <Building2 size={16} strokeWidth={1.5} color={iconColor} />
                  <span>{fixture.venue_name_ja ?? fixture.venue_name ?? '—'}</span>
                </span>
                {fixture.attendance != null && (
                  <span style={cellStyle}>
                    <Users size={16} strokeWidth={1.5} color={iconColor} />
                    <span>{Number(fixture.attendance).toLocaleString()}人</span>
                  </span>
                )}
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
      {/* J公式記録 (events) 取込後にのみ表示 */}
      {hasJLeagueRecord && (() => {
        // 同じelapsed内では Yellow → Red の順で並べる (2枚目イエロー→退場のケース)
        const evtPriority = (e) => {
          if (e.type === 'Card' && e.detail === 'Yellow Card') return 0
          if (e.type === 'Card' && (e.detail === 'Red Card' || e.detail === 'Yellow Red Card')) return 1
          return 2
        }
        const tlEvents = events
          .filter(e => e.type === 'Goal'
            || (e.type === 'Card' && (e.detail === 'Yellow Card' || e.detail === 'Red Card' || e.detail === 'Yellow Red Card'))
            || e.type === 'subst')
          .sort((a, b) => {
            const dt = (a.elapsed ?? 0) - (b.elapsed ?? 0)
            if (dt !== 0) return dt
            return evtPriority(a) - evtPriority(b)
          })

        // PK戦キッカー (elapsed=121+ で格納) 時系列順にソート
        const pkEvents = events
          .filter(e => e.type === 'Penalty Shootout')
          .sort((a, b) => (a.elapsed ?? 0) - (b.elapsed ?? 0))

        if (tlEvents.length === 0 && pkEvents.length === 0 && !hasStarted) return null

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

        // PK戦セクション (キッカーがいる場合のみ)
        if (pkEvents.length > 0) {
          items.push({ type: 'marker', label: 'PENALTY SHOOTOUT' })
          for (const e of pkEvents) items.push({ type: 'event', e })
        }

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
                const isPKShootout = e.type === 'Penalty Shootout'
                const pkSuccess = isPKShootout && e.detail === 'Goal'

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
                ) : isPKShootout ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 14, height: 14, marginRight: isHome ? 0 : 8, marginLeft: isHome ? 8 : 0,
                    fontSize: 14, fontWeight: 900, lineHeight: 1,
                    color: pkSuccess ? '#fff' : 'rgba(255,255,255,0.45)',
                  }}>{pkSuccess ? '○' : '×'}</span>
                ) : null

                const tag = isOG ? <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginLeft: 4 }}>OG</span>
                          : isPK ? <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginLeft: 4 }}>PK</span>
                          : null

                // PK戦は中央列に通し番号 (1, 2, ...) を表示
                const centerLabel = isPKShootout
                  ? `${(e.elapsed ?? 120) - 120}`
                  : `${e.elapsed}'`
                const centerStyle = isPKShootout
                  ? { color: 'rgba(255,255,255,0.35)', fontSize: 9 }
                  : { color: 'rgba(255,255,255,0.5)', fontSize: 10 }
                // PK戦の名前は控えめに
                const pkNameStyle = isPKShootout
                  ? { fontSize: 12, fontWeight: 600, opacity: pkSuccess ? 1 : 0.55 }
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
                            <span style={pkNameStyle ?? goalStyle}>{nameNode}{tag}</span>
                          )}
                          {!isGoal && badge}
                        </span>
                      )}
                    </div>
                    <div style={{ width: 38, textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums', ...centerStyle }}>
                      {centerLabel}
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
                            <span style={pkNameStyle ?? goalStyle}>{nameNode}{tag}</span>
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

            {/* アウェイ (ホームと同じ並び:位置→番号→名前→交代/カード) */}
            <div style={{ flex: 1, paddingLeft: 16 }}>
              {/* LINE UP ヘッダー */}
              <div style={{ backgroundColor: awayColor, height: 20, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: textColor(awayColor), letterSpacing: '0.12em', lineHeight: 1 }}>LINE UP</span>
              </div>
              {awayStarters.slice(0, 11).map((p, i) => {
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
              {awaySubs.length > 0 && (
                <>
                  <div style={{ backgroundColor: awayColor, height: 20, marginTop: 12, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 900, color: textColor(awayColor), letterSpacing: '0.12em', lineHeight: 1 }}>BENCH</span>
                  </div>
                  {awaySubs.slice(0, 9).map((p, i) => {
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
          </div>
        </section>
        ) : null

        // 各種ランキング用データ準備
        // 同値は同順位、TOP5位タイは全員含める (6位7位になってもOK)
        const topNWithTies = (sorted, n, getVal) => {
          if (sorted.length <= n) return sorted
          const cutoff = getVal(sorted[n - 1])
          let end = n
          while (end < sorted.length && getVal(sorted[end]) === cutoff) end++
          return sorted.slice(0, end)
        }
        const withRanks = (items, getVal) => {
          let prevVal = null
          let prevRank = 0
          return items.map((p, i) => {
            const v = getVal(p)
            if (i > 0 && v === prevVal) {
              return { ...p, _rank: prevRank, _showRank: false }
            }
            prevVal = v
            prevRank = i + 1
            return { ...p, _rank: prevRank, _showRank: true }
          })
        }

        // 同値時のタイブレーク: ホーム優先 → ポジション順 → 背番号順
        const homeIdNum = Number(fixture.home_team_id)
        const posOrderRk = { G: 1, D: 2, M: 3, F: 4, GK: 1, DF: 2, MF: 3, FW: 4 }
        const cmpTiebreak = (a, b) => {
          const ah = Number(a.team_id) === homeIdNum ? 0 : 1
          const bh = Number(b.team_id) === homeIdNum ? 0 : 1
          if (ah !== bh) return ah - bh
          const ap = posOrderRk[a.position] ?? 5
          const bp = posOrderRk[b.position] ?? 5
          if (ap !== bp) return ap - bp
          return (Number(a.number) || 999) - (Number(b.number) || 999)
        }
        // ポジション表示用 (G/D/M/F → GK/DF/MF/FW)
        const posLabel = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' }
        const withPosLabel = p => ({ ...p, position: posLabel[p.position] ?? p.position })

        const ratingSorted = playerStats
          .filter(p => p.rating != null && Number(p.rating) > 0)
          .sort((a, b) => {
            const d = Number(b.rating) - Number(a.rating)
            return d !== 0 ? d : cmpTiebreak(a, b)
          })
        const ratingTop5 = withRanks(
          topNWithTies(ratingSorted, 5, p => Number(p.rating)),
          p => Number(p.rating),
        ).map(p => ({
          ...withPosLabel(p),
          _bar: Math.max(0, Math.min(1, (Number(p.rating) - 5) / 5)),  // 5〜10 → 0〜1
          _main: Number(p.rating).toFixed(2),
          _sub: `${p.minutes}'`,
        }))

        const shotsSorted = playerStats
          .filter(p => Number(p.shots_total) > 0)
          .sort((a, b) => {
            const d = Number(b.shots_total) - Number(a.shots_total)
            return d !== 0 ? d : cmpTiebreak(a, b)
          })
        const shotsTop5Raw = topNWithTies(shotsSorted, 5, p => Number(p.shots_total))
        const maxShots = shotsTop5Raw[0] ? Number(shotsTop5Raw[0].shots_total) : 1
        const shotsTop5 = withRanks(shotsTop5Raw, p => Number(p.shots_total)).map(p => ({
          ...withPosLabel(p),
          _bar: Number(p.shots_total) / maxShots,
          _main: String(p.shots_total),
          _sub: `枠内 ${p.shots_on ?? 0}`,
        }))

        const passAccSorted = playerStats
          .filter(p => Number(p.passes_total) >= 30 && p.passes_accuracy != null)
          .map(p => ({ ...p, _acc: Number(p.passes_accuracy) / Number(p.passes_total) * 100 }))
          .sort((a, b) => {
            const d = b._acc - a._acc
            return d !== 0 ? d : cmpTiebreak(a, b)
          })
        const passAccTop5 = withRanks(
          topNWithTies(passAccSorted, 5, p => p._acc),
          p => p._acc,
        ).map(p => ({
          ...withPosLabel(p),
          _bar: p._acc / 100,
          _main: `${p._acc.toFixed(1)}%`,
          _sub: `${p.passes_total}本`,
        }))

        const duelWinSorted = playerStats
          .filter(p => Number(p.duels_total) >= 5)
          .map(p => ({ ...p, _rate: Number(p.duels_won) / Number(p.duels_total) * 100 }))
          .sort((a, b) => {
            const d = b._rate - a._rate
            return d !== 0 ? d : cmpTiebreak(a, b)
          })
        const duelWinTop5 = withRanks(
          topNWithTies(duelWinSorted, 5, p => p._rate),
          p => p._rate,
        ).map(p => ({
          ...withPosLabel(p),
          _bar: p._rate / 100,
          _main: `${p._rate.toFixed(1)}%`,
          _sub: `${p.duels_won}/${p.duels_total}`,
        }))

        const ratingsChartsJsx = (isFinished && playerStats.length > 0) ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 24, alignItems: 'center' }}>
            <div style={{ width: '100%' }}>
              <PlayerRankingBar title="レーティング TOP 5" data={ratingTop5}
                homeTeamId={fixture.home_team_id} homeColor={homeColor} awayColor={awayColor} />
            </div>
            <div style={{ width: '100%' }}>
              <PlayerRankingBar title="シュート本数 TOP 5" data={shotsTop5}
                homeTeamId={fixture.home_team_id} homeColor={homeColor} awayColor={awayColor} />
            </div>
            <div style={{ width: '100%' }}>
              <PlayerRankingBar title="パス成功率 TOP 5" subtitle="※ 30パス以上" data={passAccTop5}
                homeTeamId={fixture.home_team_id} homeColor={homeColor} awayColor={awayColor} />
            </div>
            <div style={{ width: '100%' }}>
              <PlayerRankingBar title="デュエル勝率 TOP 5" subtitle="※ 5回以上" data={duelWinTop5}
                homeTeamId={fixture.home_team_id} homeColor={homeColor} awayColor={awayColor} />
            </div>
            <div style={{ width: '100%' }}>
              <RatingMinutesScatter playerStats={playerStats} homeTeamId={fixture.home_team_id} awayTeamId={fixture.away_team_id} homeColor={homeColor} awayColor={awayColor} homeScore={fixture.home_score ?? 0} awayScore={fixture.away_score ?? 0} homeShort={fixture.home_short} awayShort={fixture.away_short} />
            </div>
          </section>
        ) : null

        const refereeHistoryJsx = (hasReferee && (homeRefereeHistory.length > 0 || awayRefereeHistory.length > 0 || homeRefereeRecord.total > 0 || awayRefereeRecord.total > 0)) ? (
        <section style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 15, color: '#fff', marginBottom: 12, textAlign: 'center' }}>
            {`${(fixture.referee_ja_official ?? fixture.referee_ja ?? refereeJa ?? fixture.referee_en ?? '').replace(/\s+/g, '')} 担当試合成績`}
          </p>
          <RefereeSection
            homeTeamId={fixture.home_team_id} awayTeamId={fixture.away_team_id}
            homeColor={homeColor} awayColor={awayColor}
            homeRecord={homeRefereeRecord} awayRecord={awayRefereeRecord}
            homeFirst={homeRefereeFirst} awayFirst={awayRefereeFirst}
            homeHistory={homeRefereeHistory} awayHistory={awayRefereeHistory}
          />
        </section>
        ) : null

        // 未開催: タブ群の上に表示する 順位推移 (+ J1のみレーダー2個)
        const rankAndRadarJsx = !hasStarted && seasonFixtures.length > 0 && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 24, alignItems: 'center' }}>
            <div style={{ width: '100%' }}>
              <FixtureRankChart
                allFixtures={seasonFixtures} allTeams={allTeams}
                homeTeamId={fixture.home_team_id} awayTeamId={fixture.away_team_id}
                homeColor={homeColor} awayColor={awayColor}
                currentRound={fixture.round_number}
              />
            </div>
            {/* レーダーは API-Football スタッツ依存なので J1 のみ */}
            {!isJ2J3 && homeSeasonStats?.games > 0 && (
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
          </section>
        )

        // 未開催「選手スタッツ」タブ用: 散布図4種
        const preMatchScattersJsx = !hasStarted && seasonPlayerStats.length > 0 ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 32, marginBottom: 24, alignItems: 'center' }}>
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
          </section>
        ) : null

        // 未開催「H2H」タブ: 通算成績 + 直近5試合
        const h2hJsx = !hasStarted ? (() => {
          if (!h2hRows || h2hRows.length === 0) {
            return (
              <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 32 }}>
                過去の対戦データはありません
              </p>
            )
          }
          // ホームチーム視点で集計
          const hid = Number(fixture.home_team_id)
          let w = 0, d = 0, l = 0, gf = 0, ga = 0
          for (const f of h2hRows) {
            const isHome = Number(f.home_team_id) === hid
            const myScore = isHome ? Number(f.home_score) : Number(f.away_score)
            const oppScore = isHome ? Number(f.away_score) : Number(f.home_score)
            const isPK = f.status === 'PEN' && f.home_penalty != null && f.away_penalty != null
            const myPK = isPK ? (isHome ? Number(f.home_penalty) : Number(f.away_penalty)) : null
            const oppPK = isPK ? (isHome ? Number(f.away_penalty) : Number(f.home_penalty)) : null
            gf += myScore; ga += oppScore
            if (myScore > oppScore) w++
            else if (myScore < oppScore) l++
            else if (isPK) (myPK > oppPK ? w++ : l++)
            else d++
          }
          const recent10 = h2hRows.slice(0, 10)
          return (
            <section style={{ marginBottom: 24 }}>
              {/* 通算成績 */}
              <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, marginBottom: 32 }}>
                {/* ALL GAME */}
                <div style={{ flex: 1, padding: '18px 12px', borderRight: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.83)', letterSpacing: '0.14em', marginBottom: 10, lineHeight: '18px', height: 18 }}>
                    ALL GAME
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'rgba(255,255,255,0.83)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                    {h2hRows.length}
                  </div>
                </div>
                {/* W / D / W (3つとも箱、丸みなし。数値の高さを左右の列に揃える) */}
                <div style={{ flex: 2, padding: '18px 12px', borderRight: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 28, fontVariantNumeric: 'tabular-nums' }}>
                    {[
                      { bg: homeColor, label: 'W', value: w },
                      { bg: 'rgba(255,255,255,0.18)', label: 'D', value: d },
                      { bg: awayColor, label: 'W', value: l },
                    ].map((it, idx) => (
                      <div key={idx} style={{ textAlign: 'center' }}>
                        <div style={{
                          display: 'inline-block',
                          backgroundColor: it.bg,
                          color: 'rgba(255,255,255,0.83)',
                          fontSize: 11, fontWeight: 700,
                          letterSpacing: '0.14em',
                          padding: '0 9px',
                          lineHeight: '18px',
                          height: 18,
                          marginBottom: 10,
                          verticalAlign: 'top',
                        }}>{it.label}</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: 'rgba(255,255,255,0.83)', lineHeight: 1 }}>{it.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* 得失点 (色は ALL GAME と統一) */}
                <div style={{ flex: 1, padding: '18px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.83)', letterSpacing: '0.14em', marginBottom: 10, lineHeight: '18px', height: 18 }}>
                    得失点
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.83)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                    {gf} - {ga}
                  </div>
                </div>
              </div>

              {/* 直近10試合: 10個の縦並び (上にクラブカラー線) */}
              <div style={{ marginBottom: 40 }}>
                <style>{`
                  .h2h-box { transition: transform 0.15s ease; cursor: pointer; }
                  .h2h-box:hover { transform: translateY(-2px); }
                `}</style>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.83)', letterSpacing: '0.14em', marginBottom: 14 }}>
                  LAST 10
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: 4 }}>
                  {recent10.map(f => {
                    const fIsPK = f.status === 'PEN' && f.home_penalty != null && f.away_penalty != null
                    // 勝者判定 (PK勝者も考慮)
                    let winnerSide = null
                    if (Number(f.home_score) > Number(f.away_score)) winnerSide = 'home'
                    else if (Number(f.away_score) > Number(f.home_score)) winnerSide = 'away'
                    else if (fIsPK) winnerSide = Number(f.home_penalty) > Number(f.away_penalty) ? 'home' : 'away'
                    const isDraw = winnerSide == null
                    const boxColor = isDraw ? 'rgba(255,255,255,0.12)' : (winnerSide === 'home' ? f.home_color : f.away_color)
                    const fg = isDraw ? '#fff' : textColor(boxColor)
                    const jst = new Date(new Date(f.date).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
                    const yy = String(jst.getFullYear()).slice(2)
                    const dateStr = `${yy}.${jst.getMonth() + 1}.${jst.getDate()}`
                    return (
                      <Link key={f.id} href={`/fixture/${f.id}`} style={{ textDecoration: 'none' }}>
                        <div className="h2h-box" style={{
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'center',
                          fontVariantNumeric: 'tabular-nums',
                          color: 'rgba(255,255,255,0.83)',
                        }}>
                          {/* クラブカラーの5px線 */}
                          <div style={{
                            width: '100%', height: 5,
                            backgroundColor: boxColor,
                            opacity: 0.85,
                          }} />
                          {/* 上段: 日付 */}
                          <div style={{ fontSize: 10, fontWeight: 700, marginTop: 8, letterSpacing: '0.02em' }}>
                            {dateStr}
                          </div>
                          {/* 下段: スコア (左=ホーム, 右=アウェイ) */}
                          <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4, lineHeight: 1, letterSpacing: '0.02em' }}>
                            {f.home_score}-{f.away_score}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            </section>
          )
        })() : null

        // 未開催「審判」タブ: 各チームの直近5試合 + 各試合の主審名
        const preMatchRefereeJsx = !hasStarted ? (() => {
          if (homeRecentForm.length === 0 && awayRecentForm.length === 0) {
            return (
              <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 32 }}>
                直近の試合データがありません
              </p>
            )
          }
          const renderRow = (f, teamId, clubColor) => {
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
            const refName = (f.referee_ja_official ?? f.referee_ja ?? f.referee_en ?? '').replace(/\s+/g, '')
            return (
              <Link key={f.id} href={`/fixture/${f.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 4px',
                }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 3, backgroundColor: badgeColor,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
                  }}>{result}</span>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* 上段: 主審名 (主役、目立つ) */}
                    {refName && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {refName}
                      </span>
                    )}
                    {/* 下段: 日付 + 対戦相手 + スコア (おまけ) */}
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', display: 'flex', gap: 8, fontVariantNumeric: 'tabular-nums', overflow: 'hidden' }}>
                      <span style={{ flexShrink: 0 }}>{dateStr}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{oppName}</span>
                      <span style={{ flexShrink: 0 }}>{scoreStr}</span>
                    </div>
                  </div>
                </div>
              </Link>
            )
          }
          return (
            <section style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0, borderTop: `1px solid ${homeColor}`, paddingTop: 10 }}>
                  {homeRecentForm.length > 0
                    ? homeRecentForm.map(f => renderRow(f, fixture.home_team_id, homeColor))
                    : <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>データなし</p>
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0, borderTop: `1px solid ${awayColor}`, paddingTop: 10 }}>
                  {awayRecentForm.length > 0
                    ? awayRecentForm.map(f => renderRow(f, fixture.away_team_id, awayColor))
                    : <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>データなし</p>
                  }
                </div>
              </div>
            </section>
          )
        })() : null

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

        // 未開催「Winner」タブ: クジ攻略ヒント
        const winnerJsx = !hasStarted ? (() => {
          // 各チームの今季スコア分布 (チーム視点 my-opp)
          const computeTeamDist = (teamId) => {
            const counts = new Map()
            const blowoutMatches = []
            let total = 0, w = 0, d = 0, l = 0
            for (const f of seasonFixtures) {
              const isHome = Number(f.home_team_id) === Number(teamId)
              const isAway = Number(f.away_team_id) === Number(teamId)
              if (!isHome && !isAway) continue
              total++
              const my = isHome ? Number(f.home_score) : Number(f.away_score)
              const opp = isHome ? Number(f.away_score) : Number(f.home_score)
              const key = `${my}-${opp}`
              counts.set(key, (counts.get(key) || 0) + 1)
              if (my > opp) w++
              else if (my < opp) l++
              else d++
              if (Number(f.home_score) >= 4 || Number(f.away_score) >= 4) blowoutMatches.push(f)
            }
            const sorted = [...counts.entries()]
              .map(([score, n]) => {
                const [my, opp] = score.split('-').map(Number)
                const result = my > opp ? 'W' : my < opp ? 'L' : 'D'
                return { score, n, result }
              })
              .sort((a, b) => b.n - a.n)
            return { top: sorted.slice(0, 5), blowouts: blowoutMatches.length, total, w, d, l }
          }
          const homeDist = computeTeamDist(fixture.home_team_id)
          const awayDist = computeTeamDist(fixture.away_team_id)

          // H2H スコア分布 (現ホーム視点で正規化: home-away)
          const h2hCounts = new Map()
          for (const f of h2hRows) {
            const isHomeForCurrent = Number(f.home_team_id) === Number(fixture.home_team_id)
            const h = isHomeForCurrent ? Number(f.home_score) : Number(f.away_score)
            const a = isHomeForCurrent ? Number(f.away_score) : Number(f.home_score)
            const key = `${h}-${a}`
            h2hCounts.set(key, (h2hCounts.get(key) || 0) + 1)
          }
          const h2hTopScores = [...h2hCounts.entries()]
            .map(([score, n]) => ({ score, n }))
            .sort((a, b) => b.n - a.n)
            .slice(0, 10)
          const h2hBlowouts = h2hRows.filter(f => Number(f.home_score) >= 4 || Number(f.away_score) >= 4)

          // 共通スタイル
          const headerStyle = { display: 'inline-block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.83)', letterSpacing: '0.12em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.18)' }

          // スコア + 横棒バー (count比率) — 共通スケール対応
          const ScoreBar = ({ score, n, result, scale, accent }) => {
            const widthPct = scale > 0 ? (n / scale) * 100 : 0
            const barColor = result === 'W' ? accent : result === 'L' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.4)'
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, color: '#fff', minWidth: 32, fontVariantNumeric: 'tabular-nums' }}>{score}</span>
                <div style={{ flex: 1, height: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${widthPct}%`, height: '100%', backgroundColor: barColor, opacity: 0.9 }} />
                </div>
              </div>
            )
          }

          // 共通スケール: 両チームのTOP値で揃える
          const seasonScale = Math.max(1, ...homeDist.top.map(s => s.n), ...awayDist.top.map(s => s.n))
          const h2hScale = Math.max(1, ...h2hTopScores.map(s => s.n))

          // W/D/L ドーナツチャート (中央テキストなし)
          const WDLDonut = ({ w, d, l, accent, size = 84, thickness = 11 }) => {
            const total = w + d + l
            if (total === 0) return null
            const cx = size / 2, cy = size / 2
            const r = (size - thickness) / 2
            const C = 2 * Math.PI * r
            const wLen = (w / total) * C
            const dLen = (d / total) * C
            const lLen = (l / total) * C
            return (
              <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
                <circle cx={cx} cy={cy} r={r} fill="none" stroke={accent}
                        strokeWidth={thickness} strokeDasharray={`${wLen} ${C - wLen}`} />
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.32)"
                        strokeWidth={thickness} strokeDasharray={`${dLen} ${C - dLen}`} strokeDashoffset={-wLen} />
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.14)"
                        strokeWidth={thickness} strokeDasharray={`${lLen} ${C - lLen}`} strokeDashoffset={-(wLen + dLen)} />
              </svg>
            )
          }

          // 4得点以上の試合行 (LAST 10 風: クラブカラー線 + 日付 + スコア)
          const BlowoutRow = ({ f }) => {
            const jst = new Date(new Date(f.date).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
            const dateStr = `${jst.getFullYear()}/${jst.getMonth() + 1}/${jst.getDate()}`
            return (
              <Link key={f.id} href={`/fixture/${f.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '78px 1fr auto 1fr', alignItems: 'center', columnGap: 12,
                  padding: '6px 4px', fontSize: 12, color: 'rgba(255,255,255,0.83)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>{dateStr}</span>
                  <span style={{ textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.home_name ?? ''}</span>
                  <span style={{ fontWeight: 800, color: '#fff' }}>{f.home_score}-{f.away_score}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.away_name ?? ''}</span>
                </div>
              </Link>
            )
          }

          return (
            <section style={{ marginBottom: 24 }}>
              {/* 上段: 2カラム (今シーズンのスコア傾向 + 4得点以上の試合数) */}
              <div style={{ display: 'flex', gap: 20, marginBottom: 24 }}>
                {[
                  { label: fixture.home_name ?? fixture.home_short ?? 'HOME', dist: homeDist, accent: homeColor },
                  { label: fixture.away_name ?? fixture.away_short ?? 'AWAY', dist: awayDist, accent: awayColor },
                ].map((it, idx) => (
                  <div key={idx} style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ marginBottom: 18 }}>
                      <p style={headerStyle}>今シーズンのスコア傾向</p>
                      {it.dist.total > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                          {/* 左: W/D/L ドーナツ */}
                          <WDLDonut w={it.dist.w} d={it.dist.d} l={it.dist.l} accent={it.accent} />
                          {/* 右: W/D/L サマリ + TOP5 スコア横棒 */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', gap: 14, fontSize: 10, color: 'rgba(255,255,255,0.83)', marginBottom: 8, fontVariantNumeric: 'tabular-nums' }}>
                              <span><span style={{ color: '#fff', fontWeight: 700 }}>{it.dist.w}</span>勝</span>
                              <span><span style={{ color: '#fff', fontWeight: 700 }}>{it.dist.d}</span>分</span>
                              <span><span style={{ color: '#fff', fontWeight: 700 }}>{it.dist.l}</span>敗</span>
                            </div>
                            {it.dist.top.map((s, i) => (
                              <ScoreBar key={i} score={s.score} n={s.n} result={s.result} scale={seasonScale} accent={it.accent} />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>データなし</p>
                      )}
                    </div>
                    <div>
                      <p style={headerStyle}>4得点以上</p>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: 28, fontWeight: 800, color: 'rgba(255,255,255,0.83)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                          {it.dist.blowouts}
                        </span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>試合</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 過去対戦のスコア傾向 — ヒートマップ */}
              <div style={{ marginBottom: 24 }}>
                <p style={headerStyle}>過去対戦のスコア傾向</p>
                {h2hRows.length === 0 ? (
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>データなし</p>
                ) : (() => {
                  // (h, a) ごとに試合数を集計 + 最大得点で SIZE 自動拡張 (デフォ 6×6)
                  let maxScore = 5
                  for (const f of h2hRows) {
                    const isHomeForCurrent = Number(f.home_team_id) === Number(fixture.home_team_id)
                    const h = isHomeForCurrent ? Number(f.home_score) : Number(f.away_score)
                    const a = isHomeForCurrent ? Number(f.away_score) : Number(f.home_score)
                    if (h > maxScore) maxScore = h
                    if (a > maxScore) maxScore = a
                  }
                  const SIZE = maxScore + 1
                  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0))
                  let maxCount = 0
                  for (const f of h2hRows) {
                    const isHomeForCurrent = Number(f.home_team_id) === Number(fixture.home_team_id)
                    const h = isHomeForCurrent ? Number(f.home_score) : Number(f.away_score)
                    const a = isHomeForCurrent ? Number(f.away_score) : Number(f.home_score)
                    grid[h][a]++
                    if (grid[h][a] > maxCount) maxCount = grid[h][a]
                  }
                  const cellSize = 44
                  return (
                    <>
                      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                        {/* Y軸ラベル (ホーム得点) */}
                        <div style={{ display: 'flex', flexDirection: 'column', marginRight: 4 }}>
                          <div style={{ width: 24, height: 22 }} />
                          {Array.from({ length: SIZE }, (_, h) => (
                            <div key={h} style={{ width: 24, height: cellSize, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4, fontSize: 11, color: 'rgba(255,255,255,0.55)', fontVariantNumeric: 'tabular-nums' }}>
                              {h}
                            </div>
                          ))}
                        </div>
                        {/* グリッド + X軸ラベル */}
                        <div>
                          {/* X軸 (アウェイ得点) */}
                          <div style={{ display: 'flex', height: 22 }}>
                            {Array.from({ length: SIZE }, (_, a) => (
                              <div key={a} style={{ width: cellSize, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'rgba(255,255,255,0.55)', fontVariantNumeric: 'tabular-nums' }}>
                                {a}
                              </div>
                            ))}
                          </div>
                          {/* セル */}
                          {Array.from({ length: SIZE }, (_, h) => (
                            <div key={h} style={{ display: 'flex' }}>
                              {Array.from({ length: SIZE }, (_, a) => {
                                const count = grid[h][a]
                                let bgColor = 'transparent'
                                if (count > 0) {
                                  if (h > a) bgColor = homeColor
                                  else if (h < a) bgColor = awayColor
                                  else bgColor = 'rgba(255,255,255,0.4)'
                                }
                                return (
                                  <div key={a} style={{
                                    width: cellSize, height: cellSize,
                                    backgroundColor: bgColor,
                                    opacity: count > 0 ? 0.85 : 1,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 11, fontWeight: 700, color: '#fff',
                                    fontVariantNumeric: 'tabular-nums',
                                  }}>
                                    {count > 0 ? count : ''}
                                  </div>
                                )
                              })}
                            </div>
                          ))}
                        </div>
                        {/* 右側: 多いスコア TOP10 横棒バー */}
                        <div style={{ marginLeft: 46, flex: 1, minWidth: 0, maxWidth: 280 }}>
                          {h2hTopScores.map((s, i) => {
                            const [hh, aa] = s.score.split('-').map(Number)
                            const result = hh > aa ? 'W' : hh < aa ? 'L' : 'D'
                            const barColor = result === 'W' ? homeColor : result === 'L' ? awayColor : 'rgba(255,255,255,0.4)'
                            const widthPct = maxCount > 0 ? (s.n / maxCount) * 100 : 0
                            return (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, marginBottom: 6 }}>
                                <span style={{ fontWeight: 700, color: '#fff', minWidth: 32, fontVariantNumeric: 'tabular-nums' }}>{s.score}</span>
                                <div style={{ flex: 1, height: 6, overflow: 'hidden' }}>
                                  <div style={{ width: `${widthPct}%`, height: '100%', backgroundColor: barColor, opacity: 0.85 }} />
                                </div>
                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.83)', fontVariantNumeric: 'tabular-nums', minWidth: 28, textAlign: 'right' }}>{s.n}回</span>
                              </div>
                            )
                          })}
                          {/* TOP10 下: 同一カードで4得点以上の試合トグル */}
                          {h2hBlowouts.length > 0 && (
                            <details style={{ marginTop: 14 }}>
                              <summary style={{
                                cursor: 'pointer', fontSize: 10, color: 'rgba(255,255,255,0.83)',
                                letterSpacing: '0.06em', userSelect: 'none', listStyle: 'none',
                              }}>
                                ▶ どちらかが4得点以上の試合一覧 ({h2hBlowouts.length})
                              </summary>
                              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column' }}>
                                {h2hBlowouts.map(f => {
                                  const jst = new Date(new Date(f.date).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
                                  const dateStr = `${jst.getFullYear()}/${jst.getMonth() + 1}/${jst.getDate()}`
                                  return (
                                    <Link key={f.id} href={`/fixture/${f.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                                      <div style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '4px 0', fontSize: 11,
                                        color: 'rgba(255,255,255,0.83)',
                                        fontVariantNumeric: 'tabular-nums',
                                      }}>
                                        <span style={{ minWidth: 70, flexShrink: 0 }}>{dateStr}</span>
                                        <span style={{ minWidth: 32, flexShrink: 0, fontWeight: 700, color: f.home_color, textAlign: 'center' }}>
                                          {f.home_abbr ?? '---'}
                                        </span>
                                        <span style={{ minWidth: 36, flexShrink: 0, fontWeight: 800, color: '#fff', textAlign: 'center' }}>
                                          {f.home_score}-{f.away_score}
                                        </span>
                                        <span style={{ minWidth: 32, flexShrink: 0, fontWeight: 700, color: f.away_color, textAlign: 'center' }}>
                                          {f.away_abbr ?? '---'}
                                        </span>
                                      </div>
                                    </Link>
                                  )
                                })}
                              </div>
                            </details>
                          )}
                        </div>
                      </div>
                    </>
                  )
                })()}
              </div>
            </section>
          )
        })() : null

        // 未開催「データ」タブ: 状況別成績 (ホーム/アウェイ・KO時刻・日付)
        const dataJsx = !hasStarted ? (() => {
          const hid = Number(fixture.home_team_id)
          const aid = Number(fixture.away_team_id)
          const currentSeason = Number(fixture.season ?? 2026)
          // 試合のJST時刻情報
          const koJst = new Date(new Date(fixture.date).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
          const koHour = koJst.getHours()
          // 30分バケット (0分台 or 30分台)
          const koHalfMin = koJst.getMinutes() >= 30 ? 30 : 0
          const koMM = koJst.getMonth() + 1
          const koDD = koJst.getDate()

          // 1試合ごとの結果計算
          const computeResult = (f, teamId) => {
            const isHome = Number(f.home_team_id) === Number(teamId)
            const my = isHome ? Number(f.home_score) : Number(f.away_score)
            const opp = isHome ? Number(f.away_score) : Number(f.home_score)
            const isPK = f.status === 'PEN' && f.home_penalty != null && f.away_penalty != null
            const myPK = isPK ? (isHome ? Number(f.home_penalty) : Number(f.away_penalty)) : null
            const oppPK = isPK ? (isHome ? Number(f.away_penalty) : Number(f.home_penalty)) : null
            const result = my > opp ? 'W' : my < opp ? 'L' : isPK ? (myPK > oppPK ? 'W' : 'L') : 'D'
            return { my, opp, result, isHome }
          }

          // フィルタ後集計 (W/D/L/GF/GA)
          const aggregate = (matches, teamId) => {
            let w = 0, d = 0, l = 0, gf = 0, ga = 0
            for (const f of matches) {
              const r = computeResult(f, teamId)
              gf += r.my; ga += r.opp
              if (r.result === 'W') w++
              else if (r.result === 'L') l++
              else d++
            }
            return { total: matches.length, w, d, l, gf, ga, winRate: matches.length ? Math.round(w / matches.length * 100) : 0 }
          }

          // チーム別フィルタ
          const filterTeam = (teamId, opts = {}) => {
            return teamHistory.filter(f => {
              const isHome = Number(f.home_team_id) === Number(teamId)
              const isAway = Number(f.away_team_id) === Number(teamId)
              if (!isHome && !isAway) return false
              if (opts.homeOnly && !isHome) return false
              if (opts.awayOnly && !isAway) return false
              if (opts.season != null && Number(f.season) !== Number(opts.season)) return false
              if (opts.thisSeasonOnly && Number(f.season) !== currentSeason) return false
              if (opts.koHour != null) {
                const fJst = new Date(new Date(f.date).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
                if (fJst.getHours() !== opts.koHour) return false
                // 30分バケット指定があれば一致チェック
                if (opts.koHalfMin != null) {
                  const fHalf = fJst.getMinutes() >= 30 ? 30 : 0
                  if (fHalf !== opts.koHalfMin) return false
                }
              }
              if (opts.koMD != null) {
                const fJst = new Date(new Date(f.date).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
                if ((fJst.getMonth() + 1) !== opts.koMD.m || fJst.getDate() !== opts.koMD.d) return false
              }
              return true
            })
          }

          // 各種集計を計算
          const homeHomeThis = aggregate(filterTeam(hid, { homeOnly: true, thisSeasonOnly: true }), hid)
          const awayAwayThis = aggregate(filterTeam(aid, { awayOnly: true, thisSeasonOnly: true }), aid)

          const homeHourThis = aggregate(filterTeam(hid, { koHour, koHalfMin, thisSeasonOnly: true }), hid)
          const homeHourAll  = aggregate(filterTeam(hid, { koHour, koHalfMin }), hid)
          const awayHourThis = aggregate(filterTeam(aid, { koHour, koHalfMin, thisSeasonOnly: true }), aid)
          const awayHourAll  = aggregate(filterTeam(aid, { koHour, koHalfMin }), aid)

          // 同じMM/DDの過去試合 (リストとaggregateの両方使う)
          const homeDatePast = filterTeam(hid, { koMD: { m: koMM, d: koDD } })
          const homeDateAll = aggregate(homeDatePast, hid)
          const awayDatePast = filterTeam(aid, { koMD: { m: koMM, d: koDD } })
          const awayDateAll = aggregate(awayDatePast, aid)

          // 1ブロック (ラベル + W/D/L バー + 数字)
          const StatRow = ({ label, agg, accent }) => {
            const total = agg.total || 1
            const wPct = (agg.w / total) * 100
            const dPct = (agg.d / total) * 100
            const lPct = (agg.l / total) * 100
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 10 }}>
                  <span style={{ color: 'rgba(255,255,255,0.83)', letterSpacing: '0.06em' }}>{label}</span>
                  <span style={{ color: 'rgba(255,255,255,0.83)', fontVariantNumeric: 'tabular-nums' }}>
                    {agg.total > 0 ? `${agg.total}試合 / 勝率${agg.winRate}%` : 'なし'}
                  </span>
                </div>
                {agg.total > 0 ? (
                  <>
                    <div style={{ display: 'flex', height: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${wPct}%`, backgroundColor: accent, opacity: 0.85 }} />
                      <div style={{ width: `${dPct}%`, backgroundColor: 'rgba(255,255,255,0.18)' }} />
                      <div style={{ width: `${lPct}%`, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.83)', fontVariantNumeric: 'tabular-nums' }}>
                      <span>{agg.w}勝 {agg.d}分 {agg.l}敗</span>
                      <span>得失点 {agg.gf}-{agg.ga}</span>
                    </div>
                  </>
                ) : (
                  <div style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.04)' }} />
                )}
              </div>
            )
          }

          // 同じ日付の過去試合リスト (TeamColumn 内の <details> トグル用)
          const PastDateList = ({ matches, teamId }) => {
            if (!matches || matches.length === 0) return null
            const sorted = [...matches].sort((a, b) => new Date(b.date) - new Date(a.date))
            return (
              <details style={{ marginTop: 10 }}>
                <summary style={{
                  cursor: 'pointer', fontSize: 10, color: 'rgba(255,255,255,0.83)',
                  letterSpacing: '0.06em', userSelect: 'none', listStyle: 'none',
                }}>
                  ▸ 過去の試合一覧 ({matches.length})
                </summary>
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column' }}>
                  {sorted.map(f => {
                    const isHome = Number(f.home_team_id) === Number(teamId)
                    const myScore = isHome ? Number(f.home_score) : Number(f.away_score)
                    const oppScore = isHome ? Number(f.away_score) : Number(f.home_score)
                    const oppName = isHome ? f.away_name : f.home_name
                    const jst = new Date(new Date(f.date).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
                    const dateStr = `${jst.getFullYear()}/${jst.getMonth() + 1}/${jst.getDate()}`
                    return (
                      <Link key={f.id} href={`/fixture/${f.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '4px 0', fontSize: 11,
                          color: 'rgba(255,255,255,0.83)',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          <span style={{ minWidth: 78, flexShrink: 0 }}>{dateStr}</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>vs {oppName}</span>
                          <span style={{ flexShrink: 0 }}>{myScore}-{oppScore}</span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </details>
            )
          }

          // 得点ランキング (vs 対戦相手) — 在籍クラブ別の積み上げ横棒
          // maxGoals は両チームのランキングで共通の絶対指標を渡す (= 2列で同じスケール)
          const GoalRanking = ({ rows, oppName, accent, maxGoals }) => {
            if (!rows || rows.length === 0) {
              return (
                <div style={{ marginBottom: 18 }}>
                  <p style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.83)', letterSpacing: '0.12em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.18)' }}>
                    vs {oppName} 得点ランキング
                  </p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.83)' }}>該当なし</p>
                </div>
              )
            }
            const scale = maxGoals && maxGoals > 0 ? maxGoals : (rows[0]?.goals ?? 1)
            return (
              <div style={{ marginBottom: 18 }}>
                <p style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.83)', letterSpacing: '0.12em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.18)' }}>
                  vs {oppName} 得点ランキング
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rows.map((r, i) => {
                    // 同じ得点数は左カラムに数値を出さない (1回目のみ表示)
                    const prevGoals = i > 0 ? rows[i - 1].goals : null
                    const showGoal = r.goals !== prevGoals
                    return (
                      <div key={r.player_id ?? r.player_name} style={{
                        display: 'grid',
                        gridTemplateColumns: '24px 110px 1fr',
                        alignItems: 'center', gap: 12,
                        fontSize: 12,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        <span style={{ color: '#fff', fontWeight: 800, textAlign: 'right' }}>
                          {showGoal ? r.goals : ''}
                        </span>
                        <span style={{ color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.player_name}
                        </span>
                        {/* 積み上げバー: 各セグメント幅 = goals/scale (両列で共通スケール) */}
                        <div style={{ height: 16, display: 'flex', overflow: 'hidden' }}>
                          {(r.breakdown ?? []).map((b, bi) => (
                            <div key={bi}
                              title={`${b.team_short ?? b.team_name}: ${b.goals}得点`}
                              style={{
                                width: `${(b.goals / scale) * 100}%`,
                                height: '100%',
                                backgroundColor: b.team_color ?? '#666',
                                opacity: 0.9,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          }

          // チームカラム
          const TeamColumn = ({ accent, sideHomeAway, teamId, statsHA_this, statsHour_this, statsHour_all, statsDate_all, pastDateMatches, goalsVsOpp, oppName, goalRankMax }) => (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ marginBottom: 18 }}>
                <p style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.83)', letterSpacing: '0.12em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.18)' }}>
                  {sideHomeAway === 'ホーム' ? 'ホーム時' : 'アウェイ時'}の成績
                </p>
                <StatRow label="今季" agg={statsHA_this} accent={accent} />
              </div>
              <div style={{ marginBottom: 18 }}>
                <p style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.83)', letterSpacing: '0.12em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.18)' }}>
                  {koHour}:{String(koHalfMin).padStart(2, '0')} KO の成績
                </p>
                <StatRow label="今季" agg={statsHour_this} accent={accent} />
                <StatRow label="過去全" agg={statsHour_all} accent={accent} />
              </div>
              <div style={{ marginBottom: 18 }}>
                <p style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.83)', letterSpacing: '0.12em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.18)' }}>
                  {koMM}/{koDD} の成績
                </p>
                <StatRow label="過去" agg={statsDate_all} accent={accent} />
                <PastDateList matches={pastDateMatches} teamId={teamId} />
              </div>
              <GoalRanking rows={goalsVsOpp} oppName={oppName} accent={accent} maxGoals={goalRankMax} />
            </div>
          )

          // 両ランキング共通の最大得点 (= 横棒スケール基準)
          const goalRankMax = Math.max(
            homeGoalsVsAway[0]?.goals ?? 0,
            awayGoalsVsHome[0]?.goals ?? 0,
            1
          )

          return (
            <section style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', gap: 20 }}>
                <TeamColumn
                  accent={homeColor}
                  sideHomeAway="ホーム"
                  teamId={hid}
                  statsHA_this={homeHomeThis}
                  statsHour_this={homeHourThis}
                  statsHour_all={homeHourAll}
                  statsDate_all={homeDateAll}
                  pastDateMatches={homeDatePast}
                  goalsVsOpp={homeGoalsVsAway}
                  oppName={fixture.away_name ?? fixture.away_short ?? 'AWAY'}
                  goalRankMax={goalRankMax}
                />
                <TeamColumn
                  accent={awayColor}
                  sideHomeAway="アウェイ"
                  teamId={aid}
                  statsHA_this={awayAwayThis}
                  statsHour_this={awayHourThis}
                  statsHour_all={awayHourAll}
                  statsDate_all={awayDateAll}
                  pastDateMatches={awayDatePast}
                  goalsVsOpp={awayGoalsVsHome}
                  oppName={fixture.home_name ?? fixture.home_short ?? 'HOME'}
                  goalRankMax={goalRankMax}
                />
              </div>
            </section>
          )
        })() : null

        const statsJsx = gameStatsJsx  // 試合後のみ (試合スタッツ表)

        const ratingsJsx = ratingsChartsJsx

        const postsJsx = <PostsSection fixtureId={parseInt(id)} homeAbbr={fixture.home_abbr} awayAbbr={fixture.away_abbr} />

        // 未開催試合: H2H(+データ) / Winner / 選手スタッツ / 掲示板 / 審判
        if (useTabs && !hasStarted) {
          const h2hAndDataJsx = (
            <>
              {h2hJsx}
              {dataJsx}
            </>
          )
          // 審判発表済の試合前は、審判タブを「終了後と同じ仕様 (refereeHistoryJsx)」に差し替えて
          // 初期アクティブタブも審判にする
          const refereeTabContent = isPreMatchRefereeAnnounced && refereeHistoryJsx
            ? refereeHistoryJsx
            : preMatchRefereeJsx
          // J2J3 はAPI-Football選手スタッツがないので 選手スタッツタブを除外
          const preMatchTabs = isJ2J3
            ? [
                { key: 'h2h',     label: 'H2H',     content: h2hAndDataJsx },
                { key: 'winner',  label: 'Winner',  content: winnerJsx },
                { key: 'posts',   label: '掲示板',   content: postsJsx },
                { key: 'referee', label: '審判',     content: refereeTabContent },
              ]
            : [
                { key: 'h2h',     label: 'H2H',         content: h2hAndDataJsx },
                { key: 'winner',  label: 'Winner',      content: winnerJsx },
                { key: 'players', label: '選手スタッツ', content: preMatchScattersJsx },
                { key: 'posts',   label: '掲示板',       content: postsJsx },
                { key: 'referee', label: '審判',         content: refereeTabContent },
              ]
          const preMatchDefaultTab = isPreMatchRefereeAnnounced && refereeHistoryJsx ? 'referee' : undefined
          return (
            <>
              {rankAndRadarJsx}
              <MatchTabs tabs={preMatchTabs} defaultTab={preMatchDefaultTab} />
            </>
          )
        }

        // 試合中・終了済 + J公式記録未取込 (J1のみ想定): 試合スタッツ / 選手スタッツのみ
        if (useTabs && hasStarted && !hasJLeagueRecord && !isJ2J3) {
          return (
            <MatchTabs
              tabs={[
                { key: 'stats',   label: '試合スタッツ', content: statsJsx },
                { key: 'ratings', label: '選手スタッツ', content: ratingsJsx },
              ]}
            />
          )
        }

        // J2J3 試合中・終了済: メンバー / 掲示板 / 審判 のみ (API-Footballスタッツなし)
        if (useTabs && hasStarted && isJ2J3) {
          return (
            <MatchTabs
              tabs={[
                { key: 'members', label: 'メンバー', content: lineupJsx },
                { key: 'posts',   label: '掲示板',   content: postsJsx },
                { key: 'referee', label: '審判',     content: refereeHistoryJsx },
              ]}
            />
          )
        }

        // J1 試合中・終了済 + J公式記録あり: 既存5タブ
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
