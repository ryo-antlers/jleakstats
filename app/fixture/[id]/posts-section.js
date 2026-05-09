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
      p.guest_name,
      p.body,
      p.created_at,
      p.updated_at,
      COALESCE(up.display_name, p.guest_name) AS display_name,
      up.avatar_text AS avatar_text,
      up.supported_club_id,
      t.name_ja      AS club_name_ja,
      t.abbr         AS club_abbr,
      t.color_primary AS club_color,
      (p.clerk_user_id IS NULL) AS is_guest,
      (
        SELECT COUNT(*) FROM reports r WHERE r.post_id = p.id
      )::int AS report_count
    FROM posts p
    LEFT JOIN user_profiles up ON up.clerk_user_id = p.clerk_user_id
    LEFT JOIN teams_master t   ON t.id = up.supported_club_id
    WHERE p.fixture_id = ${fixtureId}
      AND p.deleted_at IS NULL
    ORDER BY p.created_at ASC
  `

  let myProfile = null
  if (userId) {
    const rows = await sql`
      SELECT
        up.display_name,
        up.avatar_text,
        t.name_ja      AS club_name_ja,
        t.abbr         AS club_abbr,
        t.color_primary AS club_color
      FROM user_profiles up
      LEFT JOIN teams_master t ON t.id = up.supported_club_id
      WHERE up.clerk_user_id = ${userId}
    `
    if (rows.length > 0) myProfile = rows[0]
  }

  return (
    <PostsView
      fixtureId={fixtureId}
      posts={posts}
      userId={userId}
      hasProfile={!!myProfile}
      profile={myProfile}
    />
  )
}
