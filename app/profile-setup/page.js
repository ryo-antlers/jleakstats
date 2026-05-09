import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import sql from '@/lib/db'
import ProfileForm from './profile-form'

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
      SELECT display_name, supported_club_id, club_changed_at
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

  return <ProfileForm clubs={clubs} profile={profile} next={next} />
}
