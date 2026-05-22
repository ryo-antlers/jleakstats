import { auth } from '@clerk/nextjs/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import sql from '@/lib/db'
import RatingPageView from '@/app/rating/rating-view'
import {
  WATCH_TYPE_LABELS, WATCH_TYPE_ICONS, ACCESS_LABELS, ACCESS_ICONS,
} from '@/app/notes/_shared'

export const dynamic = 'force-dynamic'

// ───────────────────────────────────────────────
// /u/[id]/match/[fixture_id]
//   - 他ユーザーが書いた観戦ノート + 採点を読み取り専用で表示
//   - ログイン必須 (ノートはログイン済ユーザーのみに公開)
//   - 自分のページなら /rating/[fixture_id] にリダイレクト (編集モードへ)
// ───────────────────────────────────────────────

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

function formatJST(iso) {
  if (!iso) return ''
  const d = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

async function resolveTarget(id) {
  const isHandleLike = /^[a-zA-Z0-9_-]{3,20}$/.test(id) && !id.startsWith('user_')
  let rows
  if (isHandleLike) {
    rows = await sql`SELECT clerk_user_id, display_name, handle, supported_club_id FROM user_profiles WHERE handle = ${id}`
    if (rows.length === 0) {
      rows = await sql`SELECT clerk_user_id, display_name, handle, supported_club_id FROM user_profiles WHERE clerk_user_id = ${id}`
    }
  } else {
    rows = await sql`SELECT clerk_user_id, display_name, handle, supported_club_id FROM user_profiles WHERE clerk_user_id = ${id}`
  }
  return rows[0] ?? null
}

export async function generateMetadata({ params }) {
  const { id, fixture_id } = await params
  const target = await resolveTarget(id)
  if (!target) return { title: 'ユーザーが見つかりません | J.Leak Stats' }
  return { title: `${target.display_name} の試合ノート #${fixture_id} | J.Leak Stats` }
}

export default async function UserMatchPage({ params }) {
  const { userId: viewerId } = await auth()
  if (!viewerId) {
    const { id, fixture_id } = await params
    redirect(`/sign-in?redirect_url=/u/${id}/match/${fixture_id}`)
  }

  const { id, fixture_id } = await params
  const fixtureId = Number(fixture_id)
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) notFound()

  const target = await resolveTarget(id)
  if (!target) notFound()

  // 自分のページなら /rating/[id] にリダイレクト
  if (target.clerk_user_id === viewerId) {
    redirect(`/rating/${fixtureId}`)
  }

  const targetUserId = target.clerk_user_id
  const supportedClubId = target.supported_club_id ? Number(target.supported_club_id) : null

  // 試合データ
  const fixtureRows = await sql`
    SELECT
      f.id, f.date, f.home_team_id, f.away_team_id,
      f.home_score, f.away_score, f.home_penalty, f.away_penalty,
      f.status, f.round_number, f.league_id, f.venue_name_ja,
      ht.name_ja AS home_name, ht.short_name AS home_short,
      ht.color_primary AS home_color,
      at.name_ja AS away_name, at.short_name AS away_short,
      at.color_primary AS away_color
    FROM fixtures f
    LEFT JOIN teams_master ht ON ht.id = f.home_team_id
    LEFT JOIN teams_master at ON at.id = f.away_team_id
    WHERE f.id = ${fixtureId}
  `
  const fixture = fixtureRows[0]
  if (!fixture) notFound()

  // 観戦ノート
  const noteRows = await sql`
    SELECT watch_type, access, companion, next_visit_memo, departure_prefecture, departure_city
    FROM watch_notes
    WHERE clerk_user_id = ${targetUserId} AND fixture_id = ${fixtureId}
  `
  const note = noteRows[0] ?? null

  // 採点 (推しクラブ側のスタメン + 出場分のあるサブ)
  const lineups = supportedClubId ? await sql`
    SELECT
      fl.player_id, fl.team_id, fl.player_name_en, fl.number, fl.position, fl.is_starter,
      pm.name_ja,
      COALESCE(fps.minutes, 0) AS minutes_played
    FROM fixture_lineups fl
    LEFT JOIN players_master pm ON pm.id = fl.player_id
    LEFT JOIN fixture_player_stats fps
      ON fps.fixture_id = fl.fixture_id AND fps.player_id = fl.player_id
    WHERE fl.fixture_id = ${fixtureId}
      AND fl.team_id = ${supportedClubId}
      AND fl.player_id IS NOT NULL
      AND (fl.is_starter = true OR COALESCE(fps.minutes, 0) > 0)
    ORDER BY
      CASE fl.position WHEN 'G' THEN 1 WHEN 'D' THEN 2 WHEN 'M' THEN 3 WHEN 'F' THEN 4 ELSE 5 END,
      fl.is_starter DESC,
      fl.number ASC NULLS LAST
  ` : []

  const targetRatings = await sql`
    SELECT r.player_id, r.score, r.skipped
    FROM ratings r
    WHERE r.clerk_user_id = ${targetUserId} AND r.fixture_id = ${fixtureId}
  `

  const isHome = Number(fixture.home_team_id) === supportedClubId
  const teamInfo = {
    name_ja: isHome ? fixture.home_name : fixture.away_name,
    short_name: isHome ? fixture.home_short : fixture.away_short,
    color: isHome ? fixture.home_color : fixture.away_color,
  }

  const homeColor = normalizeColor(fixture.home_color)
  const awayColor = normalizeColor(fixture.away_color)
  const isPK = fixture.status === 'PEN' && fixture.home_penalty != null
  const isNoWatch = note?.watch_type === 'no_watch'

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', paddingTop: 18 }}>

      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <Link href={`/u/${target.handle ?? target.clerk_user_id}`} style={{
          fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em',
          textDecoration: 'none',
        }}>
          ◂ {target.display_name} のプロフィール
        </Link>
      </div>

      {/* チーム名 */}
      <div style={{ display: 'flex', marginBottom: 12, alignItems: 'center', maxWidth: 560, margin: '0 auto 12px' }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
            {fixture.home_name ?? fixture.home_short ?? '-'}
          </span>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
            {fixture.away_name ?? fixture.away_short ?? '-'}
          </span>
        </div>
      </div>

      {/* スコア */}
      <div style={{ display: 'flex', maxWidth: 560, margin: '0 auto 8px' }}>
        <div style={{ flex: 1, height: 48, backgroundColor: homeColor, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span style={{ fontSize: 26, fontWeight: 900, color: textOn(homeColor), lineHeight: 1 }}>
            {fixture.home_score ?? 0}
          </span>
          {isPK && (
            <span style={{ fontSize: 12, fontWeight: 900, color: textOn(homeColor), opacity: 0.7 }}>
              ({fixture.home_penalty})
            </span>
          )}
        </div>
        <div style={{ flex: 1, height: 48, backgroundColor: awayColor, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          {isPK && (
            <span style={{ fontSize: 12, fontWeight: 900, color: textOn(awayColor), opacity: 0.7 }}>
              ({fixture.away_penalty})
            </span>
          )}
          <span style={{ fontSize: 26, fontWeight: 900, color: textOn(awayColor), lineHeight: 1 }}>
            {fixture.away_score ?? 0}
          </span>
        </div>
      </div>
      <div style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>
        {formatJST(fixture.date)}{fixture.venue_name_ja ? ` ・ ${fixture.venue_name_ja}` : ''}
      </div>

      {/* 観戦ノート (読み取り専用) */}
      <section style={{
        maxWidth: 560, margin: '0 auto 24px',
        paddingTop: 18, borderTop: '1px solid #1a1a1a',
      }}>
        <p style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
          color: 'rgba(255,255,255,0.4)', margin: '14px 0 16px',
          textAlign: 'center',
        }}>WATCH NOTE</p>
        {note ? (
          <NoteReadOnly note={note} />
        ) : (
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '20px 0' }}>
            観戦ノートは記録されていません
          </p>
        )}
      </section>

      {/* 採点 (読み取り専用、観てない 以外で 1 件でも採点があれば表示) */}
      {!isNoWatch && targetRatings.length > 0 && supportedClubId && lineups.length > 0 && (
        <RatingPageView
          fixture={fixture}
          lineups={lineups}
          teamInfo={teamInfo}
          myRatings={targetRatings}
          viewOnly={true}
          viewerName={target.display_name}
        />
      )}
    </div>
  )
}

// 観戦ノートの読み取り専用表示
function NoteReadOnly({ note }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Row label="観戦区分">
        <Chip>{WATCH_TYPE_ICONS[note.watch_type]} {WATCH_TYPE_LABELS[note.watch_type]}</Chip>
      </Row>
      {note.watch_type === 'stadium' && note.access && (
        <Row label="アクセス">
          <Chip>{ACCESS_ICONS[note.access]} {ACCESS_LABELS[note.access]}</Chip>
        </Row>
      )}
      {note.watch_type === 'stadium' && note.departure_prefecture && (
        <Row label="出発地">
          <span style={textStyle}>
            {note.departure_prefecture}{note.departure_city ? ` ${note.departure_city}` : ''}
          </span>
        </Row>
      )}
      {note.companion && (
        <Row label="同行者"><span style={textStyle}>{note.companion}</span></Row>
      )}
      {note.next_visit_memo && (
        <Row label="次回観戦時メモ">
          <span style={{ ...textStyle, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{note.next_visit_memo}</span>
        </Row>
      )}
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{
        flex: '0 0 72px', fontSize: 10, fontWeight: 800,
        letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)',
        textTransform: 'uppercase', paddingTop: 2,
      }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}

function Chip({ children }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
      padding: '3px 10px', borderRadius: 999,
      color: 'rgba(255,255,255,0.85)',
      backgroundColor: 'rgba(255,255,255,0.08)',
    }}>{children}</span>
  )
}

const textStyle = {
  fontSize: 13, color: 'rgba(255,255,255,0.9)',
}
