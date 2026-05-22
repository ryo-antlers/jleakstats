import { auth } from '@clerk/nextjs/server'
import sql from '@/lib/db'
import Link from 'next/link'
import TopLogo from '@/app/components/TopLogo'
import ProfileHeader from '@/app/components/ProfileHeader'
import MatchCard from '@/app/components/MatchCard'
import { TYPE_META } from '@/lib/fantype/type-meta'
import { calcSeasonStadiumDistanceKm } from '@/lib/notes/distance'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: '採点 | J.Leak Stats',
}

// 採点期限: 推しクラブの「次の試合のキックオフ」まで (次がなければ無期限)
// テストモード時のみ旧26時間ルールを維持
const TEST_MODE_ALL_CLUBS = false

function normalizeColor(raw) {
  if (!raw) return '#444'
  const v = String(raw).trim()
  if (!v) return '#444'
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

function leagueLabel(leagueId) {
  switch (Number(leagueId)) {
    case 1: return 'J1'
    case 2: return 'J2'
    case 98: return '百年構想'
    case 100: return 'カップ'
    default: return ''
  }
}

function formatJST(iso) {
  if (!iso) return ''
  const d = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

export default async function RatingIndexPage() {
  const { userId } = await auth()
  if (!userId) {
    return (
      <>
        <TopLogo />
        <EmptyState
          title="ログインが必要です"
          message="採点機能はログインユーザー専用です"
          actionLabel="サインイン"
          actionHref="/sign-in?redirect_url=/rating"
        />
      </>
    )
  }

  const profiles = await sql`
    SELECT
      up.display_name,
      up.avatar_text,
      up.handle,
      up.supported_club_id,
      up.fantype_type_code,
      up.fantype_answers,
      up.jersey_number,
      up.favorite_player_id,
      up.first_match_fixture_id,
      t.name_ja AS club_name_ja,
      t.color_primary AS club_color,
      t.abbr AS club_abbr,
      fp.name_ja AS favorite_player_name_ja
    FROM user_profiles up
    LEFT JOIN teams_master t ON t.id = up.supported_club_id
    LEFT JOIN players_master fp ON fp.id = up.favorite_player_id
    WHERE up.clerk_user_id = ${userId}
  `
  const profile = profiles[0] ?? null
  if (!profile) {
    return (
      <>
        <TopLogo />
        <EmptyState
          title="プロフィール未設定"
          message="表示名とあなたのクラブを設定してください"
          actionLabel="設定する"
          actionHref="/profile-setup?next=/rating"
        />
      </>
    )
  }
  if (!profile.supported_club_id) {
    return (
      <>
        <TopLogo />
        <EmptyState
          title="推しクラブ未設定"
          message="採点機能を使うには推しクラブを設定してください"
          actionLabel="設定する"
          actionHref="/profile-setup?next=/rating"
        />
      </>
    )
  }

  const supportedClubId = Number(profile.supported_club_id)

  // 採点可能試合 (期限内 + 試合終了済 + ユーザーが未採点のチーム1つでもある)
  // テストモード: 全クラブ。本番: 推しクラブのみ
  const rateable = TEST_MODE_ALL_CLUBS
    ? await sql`
        SELECT
          f.id, f.date, f.home_team_id, f.away_team_id, f.home_score, f.away_score,
          f.home_penalty, f.away_penalty, f.status, f.league_id, f.round_number,
          f.venue_name_ja, f.attendance, f.referee_ja_official,
          ht.name_ja AS home_name, ht.short_name AS home_short, ht.abbr AS home_abbr, ht.color_primary AS home_color,
          at.name_ja AS away_name, at.short_name AS away_short, at.abbr AS away_abbr, at.color_primary AS away_color
        FROM fixtures f
        LEFT JOIN teams_master ht ON ht.id = f.home_team_id
        LEFT JOIN teams_master at ON at.id = f.away_team_id
        WHERE f.finished_at IS NOT NULL
          AND f.date + INTERVAL '26 hours' > NOW()
        ORDER BY f.date DESC
      `
    : await sql`
        SELECT
          f.id, f.date, f.home_team_id, f.away_team_id, f.home_score, f.away_score,
          f.home_penalty, f.away_penalty, f.status, f.league_id, f.round_number,
          f.venue_name_ja, f.attendance, f.referee_ja_official,
          ht.name_ja AS home_name, ht.short_name AS home_short, ht.abbr AS home_abbr, ht.color_primary AS home_color,
          at.name_ja AS away_name, at.short_name AS away_short, at.abbr AS away_abbr, at.color_primary AS away_color
        FROM fixtures f
        LEFT JOIN teams_master ht ON ht.id = f.home_team_id
        LEFT JOIN teams_master at ON at.id = f.away_team_id
        WHERE f.finished_at IS NOT NULL
          AND (f.home_team_id = ${supportedClubId} OR f.away_team_id = ${supportedClubId})
          -- 推しクラブの「次の試合のキックオフ」がまだ来ていない (= 次戦未開催) 試合のみ採点可能
          AND NOT EXISTS (
            SELECT 1 FROM fixtures f2
            WHERE (f2.home_team_id = ${supportedClubId} OR f2.away_team_id = ${supportedClubId})
              AND f2.date > f.date
              AND f2.date <= NOW()
          )
        ORDER BY f.date DESC
      `

  // 各試合・各チームについて、ユーザーが採点済みかどうか
  // ratings + fixture_lineups で (fixture_id, team_id) ごとの採点件数を集計
  const ratingMap = await sql`
    SELECT r.fixture_id, fl.team_id, COUNT(*)::int AS rated_count
    FROM ratings r
    JOIN fixture_lineups fl
      ON fl.fixture_id = r.fixture_id AND fl.player_id = r.player_id
    WHERE r.clerk_user_id = ${userId}
    GROUP BY r.fixture_id, fl.team_id
  `
  // (fixture_id, team_id) → rated_count
  const ratedSet = new Map()
  for (const row of ratingMap) {
    ratedSet.set(`${row.fixture_id}-${row.team_id}`, row.rated_count)
  }

  // 採点可能リストを (fixture, team) のペアに展開
  const rateableEntries = []
  for (const f of rateable) {
    const teams = TEST_MODE_ALL_CLUBS
      ? [{ id: f.home_team_id, isHome: true }, { id: f.away_team_id, isHome: false }]
      : [{ id: supportedClubId, isHome: Number(f.home_team_id) === supportedClubId }]
    for (const t of teams) {
      const key = `${f.id}-${t.id}`
      if (!ratedSet.has(key)) {
        rateableEntries.push({ fixture: f, teamId: t.id, isHome: t.isHome })
      }
    }
  }

  // 推しクラブの2026シーズン active 選手リスト
  // canonical 行のみ (重複IDを統合)、未出場ルーキーも含める
  const teamPlayers = supportedClubId ? await sql`
    SELECT
      pm.id AS player_id,
      pm.name_ja,
      pm.name_en AS player_name_en,
      pm.position,
      pm.no AS number
    FROM players_master pm
    WHERE pm.team_id = ${supportedClubId}
      AND pm.is_active = true
      AND (pm.canonical_id IS NULL OR pm.canonical_id = pm.id)
    ORDER BY
      CASE pm.position WHEN 'GK' THEN 1 WHEN 'DF' THEN 2 WHEN 'MF' THEN 3 WHEN 'FW' THEN 4 ELSE 5 END,
      pm.no ASC NULLS LAST,
      pm.name_ja
  `.catch(() => []) : []

  // 推しクラブの2026シーズン全試合 (相手チーム情報付き)
  const teamRoundsRows = supportedClubId ? await sql`
    SELECT
      f.round_number,
      (f.home_team_id = ${supportedClubId}) AS is_home,
      CASE WHEN f.home_team_id = ${supportedClubId} THEN at.abbr ELSE ht.abbr END AS opp_abbr,
      CASE WHEN f.home_team_id = ${supportedClubId} THEN at.color_primary ELSE ht.color_primary END AS opp_color
    FROM fixtures f
    LEFT JOIN teams_master ht ON ht.id = f.home_team_id
    LEFT JOIN teams_master at ON at.id = f.away_team_id
    WHERE f.season = 2026
      AND f.round_number IS NOT NULL
      AND (f.home_team_id = ${supportedClubId} OR f.away_team_id = ${supportedClubId})
    ORDER BY f.round_number ASC
  `.catch(() => []) : []
  const teamRounds = teamRoundsRows.map(r => ({
    round: Number(r.round_number),
    oppAbbr: r.opp_abbr,
    oppColor: r.opp_color,
    isHome: r.is_home,
  }))

  // 推しクラブに対するこのユーザーの全採点 (節ごと)
  // canonical 化: ratings.player_id (= alias の可能性) を canonical_id に集約
  // これにより teamPlayers (canonical only) と紐付け可能になる
  const myTeamRatings = supportedClubId ? await sql`
    SELECT
      COALESCE(pm.canonical_id, pm.id) AS player_id,
      r.score, r.skipped, f.round_number
    FROM ratings r
    JOIN fixtures f ON f.id = r.fixture_id
    JOIN players_master pm ON pm.id = r.player_id
    JOIN fixture_lineups fl ON fl.fixture_id = r.fixture_id AND fl.player_id = r.player_id
    WHERE r.clerk_user_id = ${userId}
      AND fl.team_id = ${supportedClubId}
      AND f.season = 2026
      AND f.round_number IS NOT NULL
  `.catch(() => []) : []

  // 推しクラブの 2026 終了試合 (全て) — 「ノートを書く」「試合ノート」用
  const allFinishedFixtures = await sql`
    SELECT
      f.id, f.date, f.home_team_id, f.away_team_id, f.home_score, f.away_score,
      f.home_penalty, f.away_penalty, f.status, f.league_id, f.round_number,
      f.venue_name_ja, f.attendance, f.referee_ja_official,
      ht.name_ja AS home_name, ht.short_name AS home_short, ht.abbr AS home_abbr, ht.color_primary AS home_color,
      at.name_ja AS away_name, at.short_name AS away_short, at.abbr AS away_abbr, at.color_primary AS away_color
    FROM fixtures f
    LEFT JOIN teams_master ht ON ht.id = f.home_team_id
    LEFT JOIN teams_master at ON at.id = f.away_team_id
    WHERE f.season = 2026
      AND f.finished_at IS NOT NULL
      AND (f.home_team_id = ${supportedClubId} OR f.away_team_id = ${supportedClubId})
    ORDER BY f.date DESC
  `

  // 観戦ノート記入済 fixture_id 一覧
  const notedRows = await sql`
    SELECT fixture_id FROM watch_notes WHERE clerk_user_id = ${userId}
  `
  const notedSet = new Set(notedRows.map(r => Number(r.fixture_id)))
  const rateableIds = new Set(rateableEntries.map(e => Number(e.fixture.id)))

  // 「ノートを書く」 = 推しクラブの終了試合のうち、ノート未記入 + 採点可能以外
  const noteToWriteFixtures = allFinishedFixtures.filter(f =>
    !notedSet.has(Number(f.id)) && !rateableIds.has(Number(f.id))
  )

  // 「試合ノート」 = 推しクラブの終了試合のうち、観戦ノート記入済 (新しい順)
  const notedFixtures = allFinishedFixtures.filter(f => notedSet.has(Number(f.id)))

  // ユーザーヘッダー用 アバター文字 / 色
  const _avatarRaw = (profile.avatar_text ?? '').trim()
  let _initial = _avatarRaw
  if (!_initial) {
    const src = (profile.display_name ?? '?').trim()
    _initial = (src[0] ?? '?').toUpperCase()
  }
  const _clubColor = normalizeColor(profile.club_color) ?? '#444'
  const _clubText = textOn(_clubColor)

  const fantypeMeta = profile.fantype_type_code ? TYPE_META[profile.fantype_type_code] : null
  const fantypeHref = fantypeMeta
    ? `/fantype/result/${profile.fantype_type_code}${profile.fantype_answers ? `?a=${profile.fantype_answers}` : ''}`
    : null

  // 今季の現地観戦距離 (km、四捨五入された整数)
  //   watch_notes の departure_* を元に算出
  const seasonDistanceKm = await calcSeasonStadiumDistanceKm({ clerkUserId: userId })

  // 初観戦試合の詳細を別途取得して profile にマージ
  if (profile.first_match_fixture_id && profile.supported_club_id) {
    const fm = await sql`
      SELECT
        f.date AS first_match_date,
        f.venue_name_ja AS first_match_venue_ja,
        (f.home_team_id = ${profile.supported_club_id}) AS first_match_is_home,
        CASE WHEN f.home_team_id = ${profile.supported_club_id} THEN at.short_name ELSE ht.short_name END AS first_match_opp_short,
        CASE WHEN f.home_team_id = ${profile.supported_club_id} THEN at.name_ja ELSE ht.name_ja END AS first_match_opp_name_ja
      FROM fixtures f
      LEFT JOIN teams_master ht ON ht.id = f.home_team_id
      LEFT JOIN teams_master at ON at.id = f.away_team_id
      WHERE f.id = ${profile.first_match_fixture_id}
    `.catch(() => [])
    if (fm.length > 0) Object.assign(profile, fm[0])
  }

  return (
    <div>
      <TopLogo />
      <ProfileHeader
        profile={profile}
        clubColor={_clubColor}
        clubText={_clubText}
        avatarLetters={_initial}
        fantypeMeta={fantypeMeta}
        fantypeHref={fantypeHref}
        seasonDistanceKm={seasonDistanceKm}
        editHref="/profile-setup?next=/rating"
      />



      {TEST_MODE_ALL_CLUBS && (
        <div style={{
          padding: '8px 12px', marginBottom: 18,
          fontSize: 10, color: 'rgba(255,255,255,0.5)',
          backgroundColor: 'rgba(255,170,0,0.06)',
          border: '1px solid rgba(255,170,0,0.2)',
          letterSpacing: '0.04em',
        }}>
          ⓘ テストモード — 全クラブ対象 / 試合終了から70時間以内
        </div>
      )}

      {/* 上部 2 列: [採点可能 1 試合] | [ノートを書く: 横スクロール] */}
      <div className="rating-top-row" style={{
        display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24,
        marginBottom: 32,
      }}>
        <RateableColumn entries={rateableEntries} />
        <NoteToWriteColumn fixtures={noteToWriteFixtures} supportedClubId={supportedClubId} />
      </div>

      {/* 選手別 節ごと採点 */}
      {supportedClubId && teamPlayers.length > 0 && (
        <PlayerRatingsSection
          players={teamPlayers}
          rounds={teamRounds}
          ratings={myTeamRatings}
        />
      )}

      {/* 試合ノート (観戦ノート記入済の試合、新しい順) */}
      <Section title="試合ノート" count={notedFixtures.length}>
        {notedFixtures.length === 0 ? (
          <EmptyMessage>まだ試合ノートはありません</EmptyMessage>
        ) : (
          notedFixtures.map(f => (
            <NotedItem
              key={f.id}
              fixture={f}
              supportedClubId={supportedClubId}
            />
          ))
        )}
      </Section>
    </div>
  )
}

// 上部左: 採点可能 (1 試合のみ想定)
function RateableColumn({ entries }) {
  return (
    <div>
      <div style={sectionHeaderStyle}>
        <h2 style={sectionTitleStyle}>採点可能</h2>
        <span style={sectionCountStyle}>{entries.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {entries.length === 0 ? (
          <EmptyMessage>採点可能な試合はありません</EmptyMessage>
        ) : (
          entries.map(({ fixture, teamId, isHome }) => (
            <RateableItem
              key={`${fixture.id}-${teamId}`}
              fixture={fixture}
              teamId={teamId}
              isHome={isHome}
            />
          ))
        )}
      </div>
    </div>
  )
}

// 上部右: ノートを書く (横スクロール)
function NoteToWriteColumn({ fixtures, supportedClubId }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={sectionHeaderStyle}>
        <h2 style={sectionTitleStyle}>ノートを書く</h2>
        <span style={sectionCountStyle}>{fixtures.length}</span>
      </div>
      {fixtures.length === 0 ? (
        <EmptyMessage>未記入の試合はありません</EmptyMessage>
      ) : (
        <div style={{
          display: 'flex', gap: 12, overflowX: 'auto',
          paddingBottom: 8,
        }}>
          {fixtures.map(f => (
            <div key={f.id} style={{ flex: '0 0 200px' }}>
              <NoteToWriteItem fixture={f} supportedClubId={supportedClubId} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ノート未記入の試合カード — /rating/[id] へ
function NoteToWriteItem({ fixture, supportedClubId }) {
  const isUserHome = Number(fixture.home_team_id) === supportedClubId
  return (
    <MatchCard
      fixtureHref={`/rating/${fixture.id}`}
      ratingHref={null}
      fixture={fixture}
      isUserHome={isUserHome}
      action={null}
    />
  )
}

// 試合ノート (記入済) カード — /rating/[id] へ (自分のページなので編集モード)
function NotedItem({ fixture, supportedClubId }) {
  const isUserHome = Number(fixture.home_team_id) === supportedClubId
  return (
    <MatchCard
      fixtureHref={`/rating/${fixture.id}`}
      ratingHref={null}
      fixture={fixture}
      isUserHome={isUserHome}
      action={null}
    />
  )
}

const sectionHeaderStyle = {
  display: 'flex', alignItems: 'baseline', gap: 10,
  marginBottom: 10, paddingBottom: 6,
  borderBottom: '1px solid #1a1a1a',
}
const sectionTitleStyle = {
  fontSize: 12, fontWeight: 800, color: '#fff',
  letterSpacing: '0.18em', margin: 0, textTransform: 'uppercase',
}
const sectionCountStyle = {
  fontSize: 10, color: 'rgba(255,255,255,0.4)',
}

function Section({ title, count, children }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <div style={sectionHeaderStyle}>
        <h2 style={sectionTitleStyle}>{title}</h2>
        <span style={sectionCountStyle}>{count}</span>
      </div>
      <div className="rating-section-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
        gap: 20,
      }}>
        {children}
      </div>
    </section>
  )
}

function EmptyMessage({ children }) {
  return (
    <p style={{
      gridColumn: '1 / -1',
      padding: '32px 12px', fontSize: 12,
      color: 'rgba(255,255,255,0.35)',
      textAlign: 'center',
    }}>
      {children}
    </p>
  )
}


function RateableItem({ fixture, isHome }) {
  // カードクリックで /rating/[id] (採点 + 観戦ノート統合画面) へ直接遷移
  return (
    <MatchCard
      fixtureHref={`/rating/${fixture.id}`}
      ratingHref={null}
      fixture={fixture}
      isUserHome={isHome}
      action={null}
    />
  )
}

// 選手 × 節 の採点テーブル
const POS_ORDER = { GK: 1, DF: 2, MF: 3, FW: 4 }
const POS_COLOR = { GK: '#fbbf24', DF: '#60a5fa', MF: '#34d399', FW: '#f87171' }

function scoreColor(n) {
  if (n == null) return 'rgba(255,255,255,0.25)'
  if (n >= 7.5) return '#00ff87'
  if (n >= 6.5) return '#a3e635'
  if (n >= 5.5) return '#fff'
  return 'rgba(255,255,255,0.5)'
}

function PlayerRatingsSection({ players, rounds, ratings }) {
  // ratings を {playerId: {roundNumber: {score, skipped}}} に組み替え
  const map = {}
  for (const r of ratings) {
    const pid = Number(r.player_id)
    const rnd = Number(r.round_number)
    map[pid] ??= {}
    map[pid][rnd] = { score: r.score == null ? null : Number(r.score), skipped: r.skipped }
  }

  // 各選手の採点・平均を事前計算
  const enriched = players.map(p => {
    const playerRatings = map[Number(p.player_id)] ?? {}
    const validScores = Object.values(playerRatings)
      .filter(r => r.score != null && !r.skipped)
      .map(r => r.score)
    const avg = validScores.length
      ? validScores.reduce((s, x) => s + x, 0) / validScores.length
      : null
    return { ...p, _ratings: playerRatings, _avg: avg }
  })

  // 平均高い順 → ポジション順 → 背番号順 (平均なしは末尾)
  const sorted = enriched.sort((a, b) => {
    const va = a._avg ?? -Infinity
    const vb = b._avg ?? -Infinity
    if (vb !== va) return vb - va
    const pa = POS_ORDER[a.position] ?? 5
    const pb = POS_ORDER[b.position] ?? 5
    if (pa !== pb) return pa - pb
    return (a.number ?? 999) - (b.number ?? 999)
  })

  const cellStyleBase = {
    padding: '6px 4px', textAlign: 'center',
    fontSize: 11, fontVariantNumeric: 'tabular-nums',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    borderRight: '1px solid rgba(255,255,255,0.08)',
    whiteSpace: 'nowrap',
    backgroundColor: '#222222',  // 行スクロール時の背後対策
  }
  const headStyle = {
    ...cellStyleBase,
    fontWeight: 800, fontSize: 9, letterSpacing: '0.06em',
    color: 'rgba(255,255,255,0.5)',
    borderBottom: '1px solid rgba(255,255,255,0.18)',
    backgroundColor: '#222222',
    position: 'sticky', top: 0, zIndex: 2,
  }
  // 左固定セル — スクロール時に必ず前面
  const stickyLeft = (left) => ({
    position: 'sticky', left,
    backgroundColor: '#222222',
    zIndex: 50,
  })
  // 左固定 + 上固定セル — 最前面
  const stickyTopLeft = (left) => ({
    position: 'sticky', top: 0, left,
    backgroundColor: '#222222',
    zIndex: 100,
  })

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10,
        marginBottom: 10, paddingBottom: 6,
        borderBottom: '1px solid #1a1a1a',
      }}>
        <h2 style={{
          fontSize: 12, fontWeight: 800, color: '#fff',
          letterSpacing: '0.18em', margin: 0,
          textTransform: 'uppercase',
        }}>
          選手別 採点
        </h2>
      </div>
      <div className="rating-table-wrap" style={{ overflowX: 'auto' }}>
        <table style={{
          borderCollapse: 'separate', borderSpacing: 0,
          fontFamily: 'inherit',
        }}>
          <thead>
            {/* 上段: 左列は空、右はクラブカラー箱 */}
            <tr>
              <th style={{ ...headStyle, ...stickyTopLeft(0), minWidth: 36, padding: 0, borderBottom: 'none' }} />
              <th style={{ ...headStyle, ...stickyTopLeft(36), minWidth: 32, padding: 0, borderBottom: 'none' }} />
              <th style={{ ...headStyle, ...stickyTopLeft(68), minWidth: 120, padding: 0, borderBottom: 'none' }} />
              <th style={{ ...headStyle, minWidth: 56, padding: 0, borderBottom: 'none' }} />
              {rounds.map(r => {
                const oppColor = r.oppColor && r.oppColor.startsWith('#') ? r.oppColor : (r.oppColor ? `#${r.oppColor}` : '#888')
                return (
                  <th key={r.round} style={{ ...headStyle, minWidth: 44, padding: 0, borderBottom: 'none' }}>
                    <div style={{
                      backgroundColor: r.oppAbbr ? oppColor : 'transparent',
                      color: r.oppAbbr ? textOn(oppColor) : 'transparent',
                      padding: '4px 4px',
                      fontSize: 9, fontWeight: 800, letterSpacing: '0.02em',
                      width: '100%', boxSizing: 'border-box',
                      display: 'block',
                    }}>
                      {r.oppAbbr ? `vs ${r.oppAbbr}` : '—'}
                    </div>
                  </th>
                )
              })}
            </tr>
            {/* 下段: 列ラベル */}
            <tr>
              <th style={{
                ...headStyle, ...stickyTopLeft(0), top: 22,
                minWidth: 36, textAlign: 'left', paddingLeft: 8,
              }}>POS</th>
              <th style={{ ...headStyle, ...stickyTopLeft(36), top: 22, minWidth: 32 }}>#</th>
              <th style={{ ...headStyle, ...stickyTopLeft(68), top: 22, minWidth: 120, textAlign: 'left' }}>選手</th>
              <th style={{ ...headStyle, top: 22, minWidth: 56, color: '#00ff87' }}>平均</th>
              {rounds.map(r => (
                <th key={r.round} style={{ ...headStyle, minWidth: 44, fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>
                  第{r.round}節
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => {
              const playerRatings = p._ratings
              const avg = p._avg
              const name = p.name_ja ?? p.player_name_en ?? '-'
              return (
                <tr key={p.player_id}>
                  <td style={{
                    ...cellStyleBase, ...stickyLeft(0),
                    minWidth: 36, textAlign: 'left', paddingLeft: 8,
                    color: POS_COLOR[p.position] ?? '#888',
                    fontWeight: 800, fontSize: 10, letterSpacing: '0.04em',
                  }}>
                    {p.position ?? ''}
                  </td>
                  <td style={{
                    ...cellStyleBase, ...stickyLeft(36),
                    minWidth: 32,
                    color: 'rgba(255,255,255,0.6)', fontWeight: 700,
                  }}>
                    {p.number ?? ''}
                  </td>
                  <td style={{
                    ...cellStyleBase, ...stickyLeft(68),
                    minWidth: 120, textAlign: 'left',
                    color: '#fff', fontWeight: 700, fontSize: 12,
                    overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200,
                  }}>
                    {name}
                  </td>
                  <td style={{
                    ...cellStyleBase,
                    color: avg != null ? scoreColor(avg) : 'rgba(255,255,255,0.2)',
                    fontWeight: 900,
                  }}>
                    {avg != null ? avg.toFixed(2) : ''}
                  </td>

                  {rounds.map(r => {
                    const rating = playerRatings[r.round]
                    if (!rating || rating.skipped) {
                      return <td key={r.round} style={cellStyleBase}></td>
                    }
                    return (
                      <td key={r.round} style={{
                        ...cellStyleBase,
                        color: scoreColor(rating.score),
                        fontWeight: 800,
                      }}>
                        {Number(rating.score).toFixed(1)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function EmptyState({ title, message, actionLabel, actionHref }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 20px', gap: 16,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '0.06em' }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, maxWidth: 420 }}>
        {message}
      </div>
      {actionLabel && actionHref && (
        <Link href={actionHref} style={{
          marginTop: 8,
          display: 'inline-block',
          padding: '10px 20px',
          fontSize: 11, fontWeight: 800,
          letterSpacing: '0.1em',
          color: '#000', backgroundColor: '#00ff87',
          textDecoration: 'none', textTransform: 'uppercase',
        }}>
          {actionLabel}
        </Link>
      )}
    </div>
  )
}
