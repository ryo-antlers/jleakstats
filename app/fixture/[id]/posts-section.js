import { auth } from '@clerk/nextjs/server'
import sql from '@/lib/db'
import PostsView from './posts-view'

// サーバーコンポーネント: 掲示板のトップレベル投稿 + 返信を一括取得
export default async function PostsSection({ fixtureId }) {
  const { userId } = await auth()

  const posts = await sql`
    SELECT
      p.id,
      p.parent_post_id,
      p.clerk_user_id,
      p.body,
      p.created_at,
      p.updated_at,
      up.display_name,
      up.supported_club_id,
      t.name_ja      AS club_name_ja,
      t.color_primary AS club_color
    FROM posts p
    LEFT JOIN user_profiles up ON up.clerk_user_id = p.clerk_user_id
    LEFT JOIN teams_master t   ON t.id = up.supported_club_id
    WHERE p.fixture_id = ${fixtureId}
      AND p.deleted_at IS NULL
    ORDER BY p.created_at ASC
  `

  let hasProfile = false
  if (userId) {
    const rows = await sql`
      SELECT 1 FROM user_profiles WHERE clerk_user_id = ${userId}
    `
    hasProfile = rows.length > 0
  }

  return (
    <PostsView
      fixtureId={fixtureId}
      posts={posts}
      userId={userId}
      hasProfile={hasProfile}
    />
  )
}
