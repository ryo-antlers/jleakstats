import sql from '@/lib/db'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import RatingPageView from '../rating-view'
import NoteForm from '@/app/notes/[fixture_id]/note-form'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: '採点 | J.Leak Stats',
}

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

export default async function RatingFixturePage({ params }) {
  const { userId } = await auth()
  if (!userId) {
    redirect(`/sign-in?redirect_url=/rating`)
  }

  const { id } = await params
  const fixtureId = Number(id)
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) notFound()

  // プロフィール + 推しクラブ
  const profiles = await sql`
    SELECT
      up.supported_club_id,
      t.name_ja      AS club_name_ja,
      t.short_name   AS club_short,
      t.color_primary AS club_color
    FROM user_profiles up
    LEFT JOIN teams_master t ON t.id = up.supported_club_id
    WHERE up.clerk_user_id = ${userId}
  `
  if (profiles.length === 0 || !profiles[0].supported_club_id) {
    redirect('/profile-setup?next=/rating')
  }
  const profile = profiles[0]
  const supportedClubId = Number(profile.supported_club_id)

  // 試合データ (締切: 推しクラブの次戦キックオフ時刻)
  const fixtureRows = await sql`
    SELECT
      f.id, f.date, f.home_team_id, f.away_team_id,
      f.home_score, f.away_score, f.home_penalty, f.away_penalty,
      f.status, f.round_number, f.league_id, f.finished_at,
      ht.name_ja AS home_name, ht.short_name AS home_short, ht.abbr AS home_abbr,
      ht.color_primary AS home_color,
      at.name_ja AS away_name, at.short_name AS away_short, at.abbr AS away_abbr,
      at.color_primary AS away_color,
      -- 締切 = 推しクラブの次戦 (まだキックオフされていない最も近い試合) のキックオフ時刻
      (
        SELECT MIN(f2.date) FROM fixtures f2
        WHERE (f2.home_team_id = ${supportedClubId} OR f2.away_team_id = ${supportedClubId})
          AND f2.date > NOW()
      ) AS deadline_at
    FROM fixtures f
    LEFT JOIN teams_master ht ON ht.id = f.home_team_id
    LEFT JOIN teams_master at ON at.id = f.away_team_id
    WHERE f.id = ${fixtureId}
  `
  const fixture = fixtureRows[0]
  if (!fixture) notFound()

  // 推しクラブがこの試合に出場しているか
  const inThisMatch =
    Number(fixture.home_team_id) === supportedClubId ||
    Number(fixture.away_team_id) === supportedClubId
  if (!inThisMatch) {
    redirect('/rating')
  }

  // 推しクラブの出場選手 (スタメン + 出場分のあるサブ)
  const lineups = await sql`
    SELECT
      fl.player_id,
      fl.team_id,
      fl.player_name_en,
      fl.number,
      fl.position,
      fl.is_starter,
      pm.name_ja,
      COALESCE(fps.minutes, 0) AS minutes_played
    FROM fixture_lineups fl
    LEFT JOIN players_master pm ON pm.id = fl.player_id
    LEFT JOIN fixture_player_stats fps
      ON fps.fixture_id = fl.fixture_id
     AND fps.player_id  = fl.player_id
    WHERE fl.fixture_id = ${fixtureId}
      AND fl.team_id = ${supportedClubId}
      AND fl.player_id IS NOT NULL
      AND (fl.is_starter = true OR COALESCE(fps.minutes, 0) > 0)
    ORDER BY
      CASE fl.position WHEN 'G' THEN 1 WHEN 'D' THEN 2 WHEN 'M' THEN 3 WHEN 'F' THEN 4 ELSE 5 END,
      fl.is_starter DESC,
      fl.number ASC NULLS LAST
  `

  // ユーザーの採点済みデータ
  const myRatings = await sql`
    SELECT r.player_id, r.score, r.skipped
    FROM ratings r
    WHERE r.clerk_user_id = ${userId}
      AND r.fixture_id = ${fixtureId}
  `

  // 採点済み (既に1件以上) なら閲覧モード
  const viewOnly = myRatings.length > 0

  // 観戦ノート (既存があれば取得、無ければ null)
  //   watch_type が 'no_watch' のときは採点 UI を非表示
  const noteRows = await sql`
    SELECT id, watch_type, access, companion, next_visit_memo,
           departure_prefecture, departure_city, created_at, updated_at
    FROM watch_notes
    WHERE clerk_user_id = ${userId} AND fixture_id = ${fixtureId}
  `
  const note = noteRows[0] ?? null
  const isNoWatch = note?.watch_type === 'no_watch'

  // 推しクラブの teamInfo (rating-view が使う形式)
  const isHome = Number(fixture.home_team_id) === supportedClubId
  const teamInfo = {
    name_ja: isHome ? fixture.home_name : fixture.away_name,
    short_name: isHome ? fixture.home_short : fixture.away_short,
    color: isHome ? fixture.home_color : fixture.away_color,
  }

  const homeColor = normalizeColor(fixture.home_color)
  const awayColor = normalizeColor(fixture.away_color)
  const isPK = fixture.status === 'PEN' && fixture.home_penalty != null

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', paddingTop: 18 }}>

      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <Link href={`/fixture/${fixture.id}`} style={{
          fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em',
          textDecoration: 'none',
        }}>
          試合詳細へ ▸
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
      <div style={{ display: 'flex', maxWidth: 560, margin: '0 auto 24px' }}>
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

      {/* 観戦記録セクション (常に表示) */}
      <section style={{
        maxWidth: 560, margin: '0 auto 24px',
        paddingTop: 18, borderTop: '1px solid #1a1a1a',
      }}>
        <p style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
          color: 'rgba(255,255,255,0.4)', margin: '14px 0 16px',
          textAlign: 'center',
        }}>WATCH NOTE</p>
        <NoteForm
          fixtureId={fixtureId}
          initialNote={note}
          afterSaveMode="refresh"
        />
      </section>

      {/* 選手別 採点 (観戦区分 ≠ 観てない のみ表示) */}
      {!isNoWatch && (
        <RatingPageView
          fixture={fixture}
          lineups={lineups}
          teamInfo={teamInfo}
          myRatings={myRatings}
          viewOnly={viewOnly}
        />
      )}
    </div>
  )
}
