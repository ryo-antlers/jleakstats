import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import sql from '@/lib/db'
import ProfileForm from './profile-form'
import { TYPE_META } from '@/lib/jlsp/type-meta'

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
      SELECT display_name, supported_club_id, club_changed_at,
        jlsp_type_code, jlsp_answers, jlsp_updated_at
      FROM user_profiles
      WHERE clerk_user_id = ${userId}
    `,
  ])

  const profile = profileRows[0]
    ? {
        display_name: profileRows[0].display_name,
        supported_club_id: profileRows[0].supported_club_id,
        club_changed_at: profileRows[0].club_changed_at,
      }
    : null

  const jlsp = profileRows[0]?.jlsp_type_code
    ? {
        code: profileRows[0].jlsp_type_code,
        answers: profileRows[0].jlsp_answers,
        updated_at: profileRows[0].jlsp_updated_at,
        meta: TYPE_META[profileRows[0].jlsp_type_code] ?? null,
      }
    : null

  return (
    <>
      <ProfileForm clubs={clubs} profile={profile} next={next} />
      <JlspSection jlsp={jlsp} />
    </>
  )
}

function JlspSection({ jlsp }) {
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
