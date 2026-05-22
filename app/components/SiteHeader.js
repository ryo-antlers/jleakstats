import { auth } from '@clerk/nextjs/server'
import sql from '@/lib/db'
import SiteHeaderMenu from './SiteHeaderMenu'

// グローバルヘッダー (app/layout.js から全ページに表示)
//   - 左: ロゴ
//   - 中央 (PC): 主要ナビ (試合検索 / 採点 / 観戦ノート / FANTYPE)
//   - 右: ユーザーアバター (ログイン時はユニフォーム形、ゲストは Sign in)
//   - スマホ: 中央ナビをハンバーガーに折りたたみ (Client Component で開閉)
export default async function SiteHeader() {
  const { userId } = await auth()
  let profile = null
  if (userId) {
    const rows = await sql`
      SELECT
        up.display_name, up.avatar_text, up.handle, up.jersey_number,
        t.color_primary AS club_color
      FROM user_profiles up
      LEFT JOIN teams_master t ON t.id = up.supported_club_id
      WHERE up.clerk_user_id = ${userId}
    `.catch(() => [])
    profile = rows[0] ?? null
  }
  return <SiteHeaderMenu profile={profile} />
}
