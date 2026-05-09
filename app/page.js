import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import sql from '@/lib/db'

export const revalidate = 0 // キャッシュ無効・常に最新

import LeagueGroupTabs from '@/app/components/LeagueGroupTabs'
import StandingsChart from '@/app/components/StandingsChart'
import PointsChart from '@/app/components/PointsChart'

// ヘルパー
function normalizeColor(raw) {
  if (!raw) return null
  const v = String(raw).trim()
  if (!v) return null
  return v.startsWith('#') ? v : `#${v}`
}
function textOn(hex) {
  const h = (hex ?? '').replace('#', '')
  if (h.length < 6) return '#fff'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? '#fff' : '#000'
}

async function getMyProfile() {
  const { userId } = await auth()
  if (!userId) return null
  const rows = await sql`
    SELECT up.clerk_user_id, up.display_name, up.avatar_text, up.supported_club_id,
      t.color_primary AS club_color
    FROM user_profiles up
    LEFT JOIN teams_master t ON t.id = up.supported_club_id
    WHERE up.clerk_user_id = ${userId}
  `.catch(() => [])
  return rows[0] ?? { clerk_user_id: userId, display_name: null, avatar_text: null, supported_club_id: null, club_color: null }
}

// このユーザーが既に採点済みの (fixture_id, team_id) ペア (文字列配列で返す)
async function getMyRatedKeys() {
  const { userId } = await auth()
  if (!userId) return []
  const rows = await sql`
    SELECT DISTINCT r.fixture_id, fl.team_id
    FROM ratings r
    JOIN fixture_lineups fl
      ON fl.fixture_id = r.fixture_id AND fl.player_id = r.player_id
    WHERE r.clerk_user_id = ${userId}
  `.catch(() => [])
  return rows.map(r => `${r.fixture_id}-${r.team_id}`)
}

const TEAM_ORDER = [
  290, 281, 287, 292, 294, 296, 303, 305, 306, 301, // EAST
  282, 283, 285, 288, 289, 291, 293, 302, 310, 316,  // WEST
]

// ---- データ取得 ----

const MAIN_ROUND_MIN_MATCHES = 5

async function getRoundInfo() {
  return await sql`
    SELECT round_number, MIN(date) AS first_date, COUNT(*) AS match_count
    FROM fixtures
    WHERE season = 2026 AND round_number IS NOT NULL
    GROUP BY round_number
    ORDER BY MIN(date) ASC
  `.catch(() => [])
}

function toJSTDayNum(dateStr) {
  const d = new Date(new Date(dateStr).getTime() + 9 * 60 * 60 * 1000)
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()
}

async function getFixturesByRound(roundNumber) {
  const rows = await sql`
    SELECT
      f.*,
      ht.name_ja AS home_name, ht.short_name AS home_short, ht.abbr AS home_abbr,
      ht.color_primary AS home_color,
      ht.group_name AS home_group,
      at.name_ja AS away_name, at.short_name AS away_short, at.abbr AS away_abbr,
      at.color_primary AS away_color,
      at.group_name AS away_group
    FROM fixtures f
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    WHERE f.season = 2026 AND f.round_number = ${roundNumber}
  `.catch(() => [])
  return rows.sort((a, b) => {
    const dateDiff = new Date(a.date) - new Date(b.date)
    if (dateDiff !== 0) return dateDiff
    const ai = TEAM_ORDER.indexOf(a.home_team_id)
    const bi = TEAM_ORDER.indexOf(b.home_team_id)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })
}

// カレンダー用: 任意の日付範囲のJ1試合を取得 (group_name関係なく)
async function getFixturesInRange(fromDate, toDate) {
  return await sql`
    SELECT
      f.id, f.date, f.status, f.elapsed, f.home_score, f.away_score,
      f.home_team_id, f.away_team_id,
      f.home_penalty, f.away_penalty, f.round_number, f.round, f.stage_ja,
      f.league_id, f.venue_name_ja, f.attendance, f.referee_ja_official,
      ht.name_ja AS home_name, ht.short_name AS home_short, ht.abbr AS home_abbr,
      ht.color_primary AS home_color,
      at.name_ja AS away_name, at.short_name AS away_short, at.abbr AS away_abbr,
      at.color_primary AS away_color
    FROM fixtures f
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    WHERE f.season = 2026
      AND f.league_id = 98
      AND f.date >= ${fromDate}
      AND f.date < ${toDate}
    ORDER BY f.date ASC
  `.catch(() => [])
}

// 6グループ別の試合一覧 (J1 EAST/WEST, J2J3 EAST-A/B, WEST-A/B)
async function getGroupedFixtures() {
  // J1 (league_id=98) 全試合 → JS側でEAST/WEST振り分け
  const j1All = await sql`
    SELECT
      f.id, f.date, f.status, f.elapsed, f.home_score, f.away_score,
      f.home_team_id, f.away_team_id,
      f.home_penalty, f.away_penalty, f.round_number, f.round, f.stage_ja,
      f.league_id, f.venue_name_ja,
      ht.name_ja AS home_name, ht.short_name AS home_short, ht.abbr AS home_abbr,
      ht.color_primary AS home_color, ht.group_name AS home_group,
      at.name_ja AS away_name, at.short_name AS away_short, at.abbr AS away_abbr,
      at.color_primary AS away_color, at.group_name AS away_group
    FROM fixtures f
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    WHERE f.season = 2026 AND f.league_id = 98
    ORDER BY f.date ASC
  `.catch(() => [])

  // J2J3 (league_id=2) 全試合
  const j2j3All = await sql`
    SELECT
      f.id, f.date, f.status, f.elapsed, f.home_score, f.away_score,
      f.home_team_id, f.away_team_id,
      f.home_penalty, f.away_penalty, f.round_number, f.round, f.stage_ja,
      f.league_id, f.venue_name_ja,
      ht.name_ja AS home_name, ht.short_name AS home_short, ht.abbr AS home_abbr,
      ht.color_primary AS home_color, ht.group_name AS home_group,
      at.name_ja AS away_name, at.short_name AS away_short, at.abbr AS away_abbr,
      at.color_primary AS away_color, at.group_name AS away_group
    FROM fixtures f
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    WHERE f.season = 2026 AND f.league_id = 2
    ORDER BY f.date ASC
  `.catch(() => [])

  // J1 振り分け: チームのgroup_name基準 (両端どちらかが該当すればOK)
  const j1East = j1All.filter(f => f.home_group === 'EAST' || f.away_group === 'EAST')
  const j1West = j1All.filter(f => f.home_group === 'WEST' || f.away_group === 'WEST')

  // J2J3 振り分け: stage_ja で完全一致
  const matchStage = (s) => (f) => (f.stage_ja ?? '').includes(s)
  const j2j3EastA = j2j3All.filter(matchStage('EAST-A'))
  const j2j3EastB = j2j3All.filter(matchStage('EAST-B'))
  const j2j3WestA = j2j3All.filter(matchStage('WEST-A'))
  const j2j3WestB = j2j3All.filter(matchStage('WEST-B'))

  return { j1East, j1West, j2j3EastA, j2j3EastB, j2j3WestA, j2j3WestB }
}

async function getEarlyFixtures(fromDate, toDate, excludeRounds) {
  const excludeA = excludeRounds[0]
  const excludeB = excludeRounds[1] ?? excludeRounds[0]
  const rows = await sql`
    SELECT
      f.*,
      ht.name_ja AS home_name, ht.short_name AS home_short, ht.abbr AS home_abbr,
      ht.color_primary AS home_color, ht.group_name AS home_group,
      at.name_ja AS away_name, at.short_name AS away_short, at.abbr AS away_abbr,
      at.color_primary AS away_color, at.group_name AS away_group
    FROM fixtures f
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    WHERE f.season = 2026
      AND f.date >= ${fromDate}
      AND f.date < ${toDate}
      AND f.round_number NOT IN (${excludeA}, ${excludeB})
  `.catch(() => [])
  return rows.sort((a, b) => new Date(a.date) - new Date(b.date))
}

// ---- UIコンポーネント ----

function teamAbbr(short) {
  if (!short) return '---'
  return short.slice(0, 3).toUpperCase()
}


function EarlyFixtureGroup({ fixtures }) {
  if (fixtures.length === 0) return null
  // 節ごとにグループ化
  const groups = {}
  for (const f of fixtures) {
    const key = f.round_number ?? 'unknown'
    if (!groups[key]) groups[key] = { round: f.round_number, items: [] }
    groups[key].items.push(f)
  }
  return (
    <div style={{ marginBottom: 16 }}>
      {Object.values(groups).map((g, i) => (
        <div key={i} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em' }}>ROUND {g.round}</span>
            <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.15)' }} />
          </div>
          <div className="grid-fixtures-5col">
            {g.items.map(f => {
              const isFinished = ['FT', 'AET', 'PEN'].includes(f.status)
              return isFinished
                ? <FixtureCard key={f.id} fixture={f} />
                : <UpcomingFixtureCard key={f.id} fixture={f} />
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function formatUpcomingLabel(dateStr) {
  if (!dateStr) return ''
  const d = new Date(new Date(dateStr).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  const m = d.getMonth() + 1
  const day = d.getDate()
  const dow = days[d.getDay()]
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${m}/${day} ${dow} ${hh}:${mm} KO`
}

function textColor(hex) {
  if (!hex) return '#fff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 150 ? '#2a2a2a' : '#fff'
}

function FixtureCard({ fixture }) {
  const isFinished = ['FT', 'AET', 'PEN'].includes(fixture.status)
  const hasScore = isFinished

  return (
    <Link href={`/fixture/${fixture.id}`} style={{ textDecoration: 'none' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>

        {/* チーム略称 */}
        <div style={{ display: 'flex', width: '100%' }}>
          <span className="fixture-abbr" style={{ flex: 1, fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '0.08em', textAlign: 'center' }}>
            {fixture.home_abbr ?? teamAbbr(fixture.home_short)}
          </span>
          <span className="fixture-abbr" style={{ flex: 1, fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '0.08em', textAlign: 'center' }}>
            {fixture.away_abbr ?? teamAbbr(fixture.away_short)}
          </span>
        </div>

        {/* スコアブロック */}
        {hasScore ? (
          <div style={{ display: 'flex', width: '100%' }}>
            <div className="fixture-score-tile" style={{
              flex: 1, height: 50,
              backgroundColor: fixture.home_color ?? '#444',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 30, fontWeight: 900, color: textColor(fixture.home_color),
            }}>
              {fixture.home_score ?? 0}
            </div>
            <div className="fixture-score-tile" style={{
              flex: 1, height: 50,
              backgroundColor: fixture.away_color ?? '#444',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 30, fontWeight: 900, color: textColor(fixture.away_color),
            }}>
              {fixture.away_score ?? 0}
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', width: '100%' }}>
              <div style={{ flex: 1, height: 50, backgroundColor: fixture.home_color ?? '#444' }} />
              <div style={{ flex: 1, height: 50, backgroundColor: fixture.away_color ?? '#444' }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#fff', letterSpacing: '0.05em', marginTop: 2 }}>
              {formatUpcomingLabel(fixture.date)}
            </span>
          </>
        )}

        {/* PK */}
        {fixture.status === 'PEN' && fixture.home_penalty != null && (
          <span className="pk-score" style={{ fontWeight: 700, color: '#fff' }}>
            {fixture.home_penalty} - {fixture.away_penalty}
          </span>
        )}

      </div>
    </Link>
  )
}

function UpcomingFixtureCard({ fixture }) {
  return (
    <Link href={`/fixture/${fixture.id}`} style={{ textDecoration: 'none' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        {/* チーム略称 */}
        <div style={{ display: 'flex', width: '100%' }}>
          <span className="fixture-abbr" style={{ flex: 1, fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: '0.08em', textAlign: 'center' }}>
            {fixture.home_abbr ?? teamAbbr(fixture.home_short)}
          </span>
          <span className="fixture-abbr" style={{ flex: 1, fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: '0.08em', textAlign: 'center' }}>
            {fixture.away_abbr ?? teamAbbr(fixture.away_short)}
          </span>
        </div>
        {/* カラーブロック（空） */}
        <div style={{ display: 'flex', width: '100%' }}>
          <div style={{ flex: 1, height: 50, backgroundColor: fixture.home_color ?? '#444' }} />
          <div style={{ flex: 1, height: 50, backgroundColor: fixture.away_color ?? '#444' }} />
        </div>
        {/* 日付・時刻 */}
        <span style={{ fontSize: 10, fontWeight: 600, color: '#fff', letterSpacing: '0.05em', marginTop: 2 }}>
          {formatUpcomingLabel(fixture.date)}
        </span>
      </div>
    </Link>
  )
}

// ---- メインページ ----

export default async function HomePage() {
  const [roundInfo, myProfile, ratedKeys] = await Promise.all([
    getRoundInfo(), getMyProfile(), getMyRatedKeys(),
  ])
  if (roundInfo.length === 0) {
    return (
      <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
        <p className="text-lg mb-2">試合データがまだありません</p>
        <p className="text-sm">
          <a href="/admin" style={{ color: 'var(--accent)' }}>/admin</a> からデータを取得してください
        </p>
      </div>
    )
  }

  // JSTで今日の日付数値（YYYYMMDD）
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const todayJSTNum = nowJST.getUTCFullYear() * 10000 + (nowJST.getUTCMonth() + 1) * 100 + nowJST.getUTCDate()

  // メイン節 = 5試合以上ある節（現在節の特定に使用）
  const mainRounds = roundInfo.filter(r => Number(r.match_count) >= MAIN_ROUND_MIN_MATCHES)

  // 現在のメイン節 = JSTで初戦日 ≤ 今日 の中で最新
  const currentMain = mainRounds.filter(r => toJSTDayNum(r.first_date) <= todayJSTNum).at(-1)
    ?? mainRounds[0]

  // 次節 = round_numberが現在節より大きい最初の節（first_dateではなくround_number順で判定）
  // first_dateはデータ不整合の可能性があるためround_numberで判断する
  const currentRoundNum = Number(currentMain.round_number)
  const nextMain = [...roundInfo]
    .sort((a, b) => Number(a.round_number) - Number(b.round_number))
    .find(r => Number(r.round_number) > currentRoundNum && Number(r.match_count) >= 1) ?? null

  // 例外（先行）試合 = 現在節・次節以外で、現在節初戦日〜次節初戦日の間にある試合
  const earlyWindowEnd = nextMain?.first_date ?? new Date('2099-01-01').toISOString()

  const [fixtures, nextFixtures, earlyFixturesRaw, groupedFixtures] = await Promise.all([
    getFixturesByRound(currentMain.round_number),
    nextMain ? getFixturesByRound(nextMain.round_number) : Promise.resolve([]),
    nextMain ? getEarlyFixtures(
      currentMain.first_date,
      earlyWindowEnd,
      [currentMain.round_number, nextMain.round_number]
    ) : Promise.resolve([]),
    getGroupedFixtures(),
  ])

  // Number()でキャスト比較（型不一致対策）
  const earlyFixtures = earlyFixturesRaw.filter(f =>
    Number(f.round_number) !== Number(currentMain.round_number) &&
    Number(f.round_number) !== Number(nextMain?.round_number)
  )

  const sortByDateTime = (arr) => [...arr].sort((a, b) => {
    const dateDiff = new Date(a.date) - new Date(b.date)
    if (dateDiff !== 0) return dateDiff
    return (TEAM_ORDER.indexOf(a.home_team_id) ?? 999) - (TEAM_ORDER.indexOf(b.home_team_id) ?? 999)
  })

  const eastFixtures = fixtures.filter(f => f.home_group === 'EAST' || f.away_group === 'EAST')
  const westFixtures = fixtures.filter(f => f.home_group === 'WEST' || f.away_group === 'WEST')
  const eastNextFixtures = sortByDateTime(nextFixtures.filter(f => f.home_group === 'EAST' || f.away_group === 'EAST'))
  const westNextFixtures = sortByDateTime(nextFixtures.filter(f => f.home_group === 'WEST' || f.away_group === 'WEST'))
  const eastEarlyFixtures = earlyFixtures.filter(f => f.home_group === 'EAST' || f.away_group === 'EAST')
  const westEarlyFixtures = earlyFixtures.filter(f => f.home_group === 'WEST' || f.away_group === 'WEST')

  return (
    <div>
      {/* タイトル + 装飾 */}
      <div className="title-row" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <h1 className="site-title" style={{ fontWeight: 900, color: '#fff', letterSpacing: '0.07em', lineHeight: 1 }}>
          J.Leak Stats
        </h1>
        <div className="deco-circles" style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
          <Link
            href="/search"
            className="deco-circle-white"
            style={{
              position: 'absolute', top: 0, right: 0,
              width: 100, height: 100, borderRadius: '50%',
              backgroundColor: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#000', textDecoration: 'none',
              fontSize: 14, fontWeight: 900, letterSpacing: '0.04em',
            }}
          >
            試合検索
          </Link>
          <ProfileBubble profile={myProfile} />
        </div>
      </div>

      {/* リーググループ別 タイムライン + 順位表 (アクティブタブのみ表示) */}
      <LeagueGroupTabs
        groups={groupedFixtures}
        standings={{
          j1East:    <StandingsPair group="EAST" />,
          j1West:    <StandingsPair group="WEST" />,
          j2j3EastA: <StandingsPair group="EAST-A" />,
          j2j3EastB: <StandingsPair group="EAST-B" />,
          j2j3WestA: <StandingsPair group="WEST-A" />,
          j2j3WestB: <StandingsPair group="WEST-B" />,
        }}
        myProfile={myProfile}
        ratedKeys={ratedKeys}
      />
    </div>
  )
}

// 赤い装飾丸 → プロフィールボタン
//   ログイン中: クラブカラー + アバター文字、押すと /profile-setup
//   未ログイン: 赤背景に "Sign in"、押すと /sign-in
function ProfileBubble({ profile }) {
  const sharedStyle = {
    position: 'absolute', top: 71, right: 70,
    width: 100, height: 100, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    textDecoration: 'none', cursor: 'pointer',
    fontWeight: 900, letterSpacing: '0.02em',
  }
  if (!profile) {
    return (
      <Link
        href="/sign-in?redirect_url=/"
        className="deco-circle-red"
        style={{
          ...sharedStyle,
          backgroundColor: '#8b1a1a', color: '#fff',
          fontSize: 16, letterSpacing: '0.08em',
        }}
      >
        Sign in
      </Link>
    )
  }
  const clubColor = normalizeColor(profile.club_color) ?? '#8b1a1a'
  const custom = (profile.avatar_text ?? '').trim()
  let initial = custom
  if (!initial) {
    const src = (profile.display_name ?? '?').trim()
    initial = [...src].slice(0, 2).join('') || '?'
  }
  return (
    <Link
      href="/rating"
      className="deco-circle-red"
      style={{
        ...sharedStyle,
        backgroundColor: clubColor,
        color: textOn(clubColor),
        fontSize: 24,
      }}
    >
      {initial}
    </Link>
  )
}

function StandingsPair({ group }) {
  return (
    <div className="grid-charts-2col">
      <PointsChart group={group} />
      <StandingsChart group={group} />
    </div>
  )
}
