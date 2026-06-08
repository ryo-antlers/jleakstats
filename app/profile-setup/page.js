import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import sql from '@/lib/db'
import ProfileForm from './profile-form'
import { TYPE_META } from '@/lib/fantype/type-meta'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'プロフィール設定 | J.Leak Stats',
}

export default async function ProfileSetupPage({ searchParams }) {
  const { userId } = await auth()
  if (!userId) {
    redirect('/sign-in?redirect_url=/profile-setup')
  }

  const sp = (await searchParams) ?? {}
  const next = typeof sp.next === 'string' ? sp.next : '/'

  const [clubs, profileRows] = await Promise.all([
    sql`
      SELECT id, name_ja, short_name, color_primary, group_name
      FROM teams_master
      WHERE group_name IN ('EAST', 'WEST', 'EAST-A', 'WEST-A', 'EAST-B', 'WEST-B')
      ORDER BY name_ja ASC
    `,
    sql`
      SELECT display_name, avatar_text, handle, supported_club_id, club_changed_at,
        jersey_number, favorite_player_id, first_match_fixture_id,
        fantype_type_code, fantype_answers, fantype_updated_at
      FROM user_profiles
      WHERE clerk_user_id = ${userId}
    `,
  ])

  const profile = profileRows[0]
    ? {
        display_name: profileRows[0].display_name,
        avatar_text: profileRows[0].avatar_text,
        handle: profileRows[0].handle,
        supported_club_id: profileRows[0].supported_club_id,
        club_changed_at: profileRows[0].club_changed_at,
        jersey_number: profileRows[0].jersey_number,
        favorite_player_id: profileRows[0].favorite_player_id,
        first_match_fixture_id: profileRows[0].first_match_fixture_id,
      }
    : null

  // 推しクラブが設定済みなら、その選手リストを事前取得 (推し選手 Select の初期表示用)
  const initialPlayers = profile?.supported_club_id ? await sql`
    SELECT pm.id, pm.name_ja, pm.name_en, pm.position, pm.no AS number
    FROM players_master pm
    WHERE pm.team_id = ${profile.supported_club_id}
      AND pm.is_active = true
      AND (pm.canonical_id IS NULL OR pm.canonical_id = pm.id)
    ORDER BY
      CASE pm.position WHEN 'GK' THEN 1 WHEN 'DF' THEN 2 WHEN 'MF' THEN 3 WHEN 'FW' THEN 4 ELSE 5 END,
      pm.no ASC NULLS LAST,
      pm.name_ja
  ` : []

  // 初観戦試合 (first_match_fixture_id) が設定済みなら、
  // その試合の年と、その年の試合一覧を事前取得 (Select 初期表示用)
  let initialFirstMatch = null
  if (profile?.first_match_fixture_id) {
    const r = await sql`
      SELECT EXTRACT(YEAR FROM date)::int AS year, id
      FROM fixtures WHERE id = ${profile.first_match_fixture_id}
    `
    if (r.length > 0) initialFirstMatch = { year: r[0].year, fixture_id: r[0].id }
  }
  const initialFirstMatchFixtures = (initialFirstMatch && profile?.supported_club_id) ? await sql`
    SELECT
      f.id, f.date, f.round_number, f.league_id,
      f.home_score, f.away_score,
      (f.home_team_id = ${profile.supported_club_id}) AS is_home,
      CASE WHEN f.home_team_id = ${profile.supported_club_id} THEN at.name_ja ELSE ht.name_ja END AS opp_name_ja,
      CASE WHEN f.home_team_id = ${profile.supported_club_id} THEN at.short_name ELSE ht.short_name END AS opp_short,
      f.venue_name_ja
    FROM fixtures f
    LEFT JOIN teams_master ht ON ht.id = f.home_team_id
    LEFT JOIN teams_master at ON at.id = f.away_team_id
    WHERE (f.home_team_id = ${profile.supported_club_id} OR f.away_team_id = ${profile.supported_club_id})
      AND f.season = ${initialFirstMatch.year}
      AND f.finished_at IS NOT NULL
    ORDER BY f.date ASC
  ` : []

  const jlsp = profileRows[0]?.fantype_type_code
    ? {
        code: profileRows[0].fantype_type_code,
        answers: profileRows[0].fantype_answers,
        updated_at: profileRows[0].fantype_updated_at,
        meta: TYPE_META[profileRows[0].fantype_type_code] ?? null,
      }
    : null

  return (
    <>
      <ProfileForm
        clubs={clubs}
        profile={profile}
        initialPlayers={initialPlayers}
        initialFirstMatch={initialFirstMatch}
        initialFirstMatchFixtures={initialFirstMatchFixtures}
        next={next}
      />
      {/* FANTYPE は編集ページのみ表示 (新規登録時は出さない) */}
      {profile && <FantypeSection jlsp={jlsp} />}
    </>
  )
}

function FantypeSection({ jlsp }) {
  return (
    <section
      style={{
        marginTop: 32,
        padding: 16,
        borderRadius: 8,
        border: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-secondary)',
      }}
    >
      <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '0.06em' }}>
        FANTYPE (サポーター気質診断)
      </h2>
      {jlsp ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: 'var(--accent)', letterSpacing: '0.04em' }}>
              {jlsp.code}
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              {jlsp.meta?.nickname ?? ''}
            </span>
          </div>
          {jlsp.meta?.tagline && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{jlsp.meta.tagline}</p>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <Link
              href={`/fantype/result/${jlsp.code}${jlsp.answers ? `?a=${jlsp.answers}` : ''}`}
              style={{
                fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 6,
                backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent)',
                border: '1px solid var(--accent)', textDecoration: 'none',
              }}
            >
              結果ページを開く
            </Link>
            <Link
              href="/fantype/quiz"
              style={{
                fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 6,
                backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)', textDecoration: 'none',
              }}
            >
              再診断する
            </Link>
          </div>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
            まだ診断していません。32問でサポーター気質を 16タイプ分析。
          </p>
          <Link
            href="/fantype/quiz"
            style={{
              display: 'inline-block', fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 6,
              backgroundColor: 'var(--accent)', color: '#000', textDecoration: 'none',
            }}
          >
            診断をはじめる →
          </Link>
        </div>
      )}
    </section>
  )
}
