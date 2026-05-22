import { auth } from '@clerk/nextjs/server'
import sql from '@/lib/db'
import SiteHeroShell from './SiteHeroShell'

// グローバル sticky ヘッダー
//   - 「J.Leak Stats」ロゴ + 試合検索 (白丸) + ProfileBubble (推しクラブ色 / Sign in)
//   - 下にスクロールしても上部に sticky で残る (Client 側で padding を縮める)
export default async function SiteHero() {
  const { userId } = await auth()
  let profile = null
  if (userId) {
    const rows = await sql`
      SELECT
        up.display_name, up.avatar_text, up.handle,
        up.fantype_type_code, up.fantype_answers,
        t.color_primary AS club_color
      FROM user_profiles up
      LEFT JOIN teams_master t ON t.id = up.supported_club_id
      WHERE up.clerk_user_id = ${userId}
    `.catch(() => [])
    profile = rows[0] ?? null
  }
  return <SiteHeroShell profile={profile} />
}
