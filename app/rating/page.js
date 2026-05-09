import { auth } from '@clerk/nextjs/server'
import { Building2, Flag, Users } from 'lucide-react'
import sql from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: '採点 | J.Leak Stats',
}

// 採点期限: キックオフから26時間 / 推しクラブのみ
const RATING_DEADLINE_HOURS = 26
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
      <EmptyState
        title="ログインが必要です"
        message="採点機能はログインユーザー専用です"
        actionLabel="サインイン"
        actionHref="/sign-in?redirect_url=/rating"
      />
    )
  }

  const profiles = await sql`
    SELECT
      up.display_name,
      up.avatar_text,
      up.supported_club_id,
      t.name_ja AS club_name_ja,
      t.color_primary AS club_color,
      t.abbr AS club_abbr
    FROM user_profiles up
    LEFT JOIN teams_master t ON t.id = up.supported_club_id
    WHERE up.clerk_user_id = ${userId}
  `
  const profile = profiles[0] ?? null
  if (!profile) {
    return (
      <EmptyState
        title="プロフィール未設定"
        message="表示名と推しクラブを設定してください"
        actionLabel="設定する"
        actionHref="/profile-setup?next=/rating"
      />
    )
  }
  if (!profile.supported_club_id) {
    return (
      <EmptyState
        title="推しクラブ未設定"
        message="採点機能を使うには推しクラブを設定してください"
        actionLabel="設定する"
        actionHref="/profile-setup?next=/rating"
      />
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
          AND f.date + INTERVAL '26 hours' > NOW()
          AND (f.home_team_id = ${supportedClubId} OR f.away_team_id = ${supportedClubId})
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

  // 推しクラブの2026シーズン出場選手リスト + 節ごとの採点
  const teamPlayers = supportedClubId ? await sql`
    SELECT DISTINCT ON (fl.player_id)
      fl.player_id,
      pm.name_ja,
      fl.player_name_en,
      fl.position,
      fl.number
    FROM fixture_lineups fl
    JOIN fixtures f ON f.id = fl.fixture_id
    LEFT JOIN players_master pm ON pm.id = fl.player_id
    WHERE fl.team_id = ${supportedClubId}
      AND f.season = 2026
      AND f.round_number IS NOT NULL
      AND fl.player_id IS NOT NULL
    ORDER BY fl.player_id, f.date DESC
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
  const myTeamRatings = supportedClubId ? await sql`
    SELECT r.player_id, r.score, r.skipped, f.round_number
    FROM ratings r
    JOIN fixtures f ON f.id = r.fixture_id
    JOIN fixture_lineups fl ON fl.fixture_id = r.fixture_id AND fl.player_id = r.player_id
    WHERE r.clerk_user_id = ${userId}
      AND fl.team_id = ${supportedClubId}
      AND f.season = 2026
      AND f.round_number IS NOT NULL
  `.catch(() => []) : []

  // 過去採点履歴 (採点済みの fixture+team ペア)
  const pastRows = await sql`
    SELECT
      f.id, f.date, f.home_team_id, f.away_team_id, f.home_score, f.away_score,
      f.home_penalty, f.away_penalty, f.status, f.league_id, f.round_number,
      f.venue_name_ja, f.attendance, f.referee_ja_official,
      ht.name_ja AS home_name, ht.short_name AS home_short, ht.abbr AS home_abbr, ht.color_primary AS home_color,
      at.name_ja AS away_name, at.short_name AS away_short, at.abbr AS away_abbr, at.color_primary AS away_color,
      fl.team_id AS rated_team_id,
      COUNT(*)::int AS rated_count,
      MAX(r.updated_at) AS last_updated_at
    FROM ratings r
    JOIN fixture_lineups fl
      ON fl.fixture_id = r.fixture_id AND fl.player_id = r.player_id
    JOIN fixtures f ON f.id = r.fixture_id
    LEFT JOIN teams_master ht ON ht.id = f.home_team_id
    LEFT JOIN teams_master at ON at.id = f.away_team_id
    WHERE r.clerk_user_id = ${userId}
    GROUP BY f.id, fl.team_id, ht.id, at.id
    ORDER BY MAX(r.updated_at) DESC
    LIMIT 50
  `

  // ユーザーヘッダー用 アバター文字 / 色
  const _avatarRaw = (profile.avatar_text ?? '').trim()
  let _initial = _avatarRaw
  if (!_initial) {
    const src = (profile.display_name ?? '?').trim()
    _initial = (src[0] ?? '?').toUpperCase()
  }
  const _clubColor = normalizeColor(profile.club_color) ?? '#444'
  const _clubText = textOn(_clubColor)

  return (
    <div>
      {/* ユーザーヘッダー */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '16px 0',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        marginBottom: 24,
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: '50%',
          backgroundColor: _clubColor, color: _clubText,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: _initial.length === 2 ? 22 : 28, fontWeight: 900,
          letterSpacing: '0.02em', flexShrink: 0,
        }}>
          {_initial}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 18, fontWeight: 900, color: '#fff',
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {profile.display_name ?? '名無し'}
          </div>
          {profile.club_name_ja && (
            <div style={{
              fontSize: 12, fontWeight: 700,
              color: _clubColor,
              letterSpacing: '0.04em',
            }}>
              {profile.club_name_ja}
            </div>
          )}
        </div>
        <Link href="/profile-setup?next=/rating" style={{
          fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
          padding: '7px 14px',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.2)',
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}>
          プロフィール編集
        </Link>
      </div>



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

      {/* 採点可能 */}
      <Section title="採点可能" count={rateableEntries.length}>
        {rateableEntries.length === 0 ? (
          <EmptyMessage>採点可能な試合はありません</EmptyMessage>
        ) : (
          rateableEntries.map(({ fixture, teamId, isHome }) => (
            <RateableItem
              key={`${fixture.id}-${teamId}`}
              fixture={fixture}
              teamId={teamId}
              isHome={isHome}
            />
          ))
        )}
      </Section>

      {/* 選手別 節ごと採点 */}
      {supportedClubId && teamPlayers.length > 0 && (
        <PlayerRatingsSection
          players={teamPlayers}
          rounds={teamRounds}
          ratings={myTeamRatings}
        />
      )}

      {/* 過去採点履歴 */}
      <Section title="採点履歴" count={pastRows.length}>
        {pastRows.length === 0 ? (
          <EmptyMessage>採点履歴はまだありません</EmptyMessage>
        ) : (
          pastRows.map(row => (
            <PastItem
              key={`${row.id}-${row.rated_team_id}`}
              row={row}
            />
          ))
        )}
      </Section>
    </div>
  )
}

function Section({ title, count, children }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10,
        marginBottom: 10,
        paddingBottom: 6,
        borderBottom: '1px solid #1a1a1a',
      }}>
        <h2 style={{
          fontSize: 12, fontWeight: 800, color: '#fff',
          letterSpacing: '0.18em', margin: 0,
          textTransform: 'uppercase',
        }}>
          {title}
        </h2>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
          {count}
        </span>
      </div>
      <div style={{
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

// 共通カードレイアウト (search ページと同じ構造)
//   fixtureHref: スコア箱・メタ情報のクリック先 (試合ページ)
//   ratingHref:  アクションボタンのクリック先 (採点ページ) — 任意
function MatchCard({ fixtureHref, ratingHref, fixture, isUserHome, action }) {
  const homeColor = normalizeColor(fixture.home_color)
  const awayColor = normalizeColor(fixture.away_color)
  const homeText = textOn(homeColor)
  const awayText = textOn(awayColor)
  const homeName = fixture.home_abbr || fixture.home_short || fixture.home_name || '-'
  const awayName = fixture.away_abbr || fixture.away_short || fixture.away_name || '-'
  const isPK = fixture.status === 'PEN' && fixture.home_penalty != null && fixture.away_penalty != null
  const comp = leagueLabel(fixture.league_id)
  const attendance = fixture.attendance != null ? Number(fixture.attendance).toLocaleString() : null
  const venue = fixture.venue_name_ja || null

  const halfStyle = (bg, txt, lose) => ({
    backgroundColor: bg, color: txt,
    opacity: lose ? 0.45 : 1,
    padding: '8px 8px 18px',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 2,
    minWidth: 0, minHeight: 78,
    position: 'relative',
  })
  const teamNameStyle = (txt) => ({
    fontWeight: 900, fontSize: 13, color: txt,
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    maxWidth: '100%',
  })
  const scoreStyle = (txt) => ({
    fontWeight: 900, fontSize: 26, color: txt,
    letterSpacing: '0.02em',
  })
  const pkStyle = (txt) => ({
    position: 'absolute', bottom: 3, left: 0, right: 0,
    textAlign: 'center', fontSize: 12, fontWeight: 800,
    color: txt, letterSpacing: '0.06em',
  })
  const linkReset = {
    display: 'block', textDecoration: 'none', color: 'inherit',
  }

  return (
    <div
      className="search-card"
      style={{
        display: 'flex', flexDirection: 'column',
        color: '#fff', fontVariantNumeric: 'tabular-nums',
        height: '100%', overflow: 'hidden',
      }}
    >
      {/* 上 + 中央スコア箱: 試合ページへ */}
      <Link href={fixtureHref} style={{ ...linkReset, display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          padding: '12px 12px 10px',
        }}>
          <span style={{
            fontSize: 11, color: '#fff',
            fontWeight: 800, letterSpacing: '0.02em',
          }}>
            {formatJST(fixture.date)}
          </span>
          {comp && (
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
              color: '#bbb', textTransform: 'uppercase',
            }}>
              {comp}{fixture.round_number ? ` 第${fixture.round_number}節` : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <div style={halfStyle(homeColor, homeText, !isUserHome)}>
            <span style={teamNameStyle(homeText)}>{homeName}</span>
            <span style={scoreStyle(homeText)}>{fixture.home_score}</span>
            {isPK && <span style={pkStyle(homeText)}>PK {fixture.home_penalty}</span>}
          </div>
          <div style={halfStyle(awayColor, awayText, isUserHome)}>
            <span style={teamNameStyle(awayText)}>{awayName}</span>
            <span style={scoreStyle(awayText)}>{fixture.away_score}</span>
            {isPK && <span style={pkStyle(awayText)}>PK {fixture.away_penalty}</span>}
          </div>
        </div>
      </Link>

      {/* 下: アクション (採点ページへ) + メタ情報 (試合ページへ) */}
      <div style={{ marginTop: 'auto' }}>
        {action && ratingHref && (
          <Link href={ratingHref} style={{ ...linkReset, paddingTop: 8 }}>
            {action}
          </Link>
        )}
        <Link href={fixtureHref} style={{
          ...linkReset,
          padding: '10px 12px 12px',
        }}>
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            fontSize: 10, fontWeight: 700, color: '#fff',
            minWidth: 0,
          }}>
            {venue && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 6,
                overflow: 'hidden', minWidth: 0,
              }}>
                <Building2 size={12} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                <span style={{
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{venue}</span>
              </span>
            )}
            {attendance && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 6,
                whiteSpace: 'nowrap',
              }}>
                <Users size={12} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                <span>{attendance}人</span>
              </span>
            )}
            {fixture.referee_ja_official && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 6,
                overflow: 'hidden', minWidth: 0,
              }}>
                <Flag size={12} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                <span style={{
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{fixture.referee_ja_official}</span>
              </span>
            )}
          </div>
        </Link>
      </div>
    </div>
  )
}

function RateableItem({ fixture, teamId, isHome }) {
  const teamColor = normalizeColor(isHome ? fixture.home_color : fixture.away_color)
  const action = (
    <span style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      padding: '8px 10px',
      backgroundColor: teamColor, color: textOn(teamColor),
      fontSize: 11, fontWeight: 900, letterSpacing: '0.08em',
    }}>
      採点する ▸
    </span>
  )
  return (
    <MatchCard
      fixtureHref={`/fixture/${fixture.id}`}
      ratingHref={`/rating/${fixture.id}?team=${teamId}`}
      fixture={fixture}
      isUserHome={isHome}
      action={action}
    />
  )
}

function PastItem({ row }) {
  const isHome = Number(row.rated_team_id) === Number(row.home_team_id)
  return (
    <MatchCard
      fixtureHref={`/fixture/${row.id}`}
      ratingHref={null}
      fixture={row}
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
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
          {sorted.length}名
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          borderCollapse: 'separate', borderSpacing: 0,
          fontFamily: 'inherit',
        }}>
          <thead>
            {/* 上段: 左列は空、右はクラブカラー箱 */}
            <tr>
              <th style={{ ...headStyle, minWidth: 36, padding: 0, borderBottom: 'none' }} />
              <th style={{ ...headStyle, minWidth: 32, padding: 0, borderBottom: 'none' }} />
              <th style={{ ...headStyle, minWidth: 120, padding: 0, borderBottom: 'none' }} />
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
                ...headStyle, top: 22,
                minWidth: 36, textAlign: 'left', paddingLeft: 8,
              }}>POS</th>
              <th style={{ ...headStyle, top: 22, minWidth: 32 }}>#</th>
              <th style={{ ...headStyle, top: 22, minWidth: 120, textAlign: 'left' }}>選手</th>
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
                    ...cellStyleBase, minWidth: 36, textAlign: 'left', paddingLeft: 8,
                    color: POS_COLOR[p.position] ?? '#888',
                    fontWeight: 800, fontSize: 10, letterSpacing: '0.04em',
                  }}>
                    {p.position ?? ''}
                  </td>
                  <td style={{
                    ...cellStyleBase, minWidth: 32,
                    color: 'rgba(255,255,255,0.6)', fontWeight: 700,
                  }}>
                    {p.number ?? ''}
                  </td>
                  <td style={{
                    ...cellStyleBase, minWidth: 120, textAlign: 'left',
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
