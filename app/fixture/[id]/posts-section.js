import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import sql from '@/lib/db'
import PostsView from './posts-view'

// サーバーコンポーネント: 掲示板のトップレベル投稿 + 返信を一括取得
export default async function PostsSection({ fixtureId, homeAbbr, awayAbbr }) {
  const { userId } = await auth()
  // ゲスト識別用 Cookie (リアクションの mine 判定に使う)
  const jar = await cookies()
  const guestId = jar.get('jleak_guest_id')?.value ?? ''
  const reactionUserKey = userId ?? guestId

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

  // リアクション集計 (post_id × emoji ごとに count、自分が押したかも一緒に)
  const reactionRows = await sql`
    SELECT
      pr.post_id,
      pr.emoji,
      COUNT(*)::int AS count,
      BOOL_OR(pr.clerk_user_id = ${reactionUserKey}) AS mine
    FROM post_reactions pr
    JOIN posts p ON p.id = pr.post_id
    WHERE p.fixture_id = ${fixtureId}
      AND p.deleted_at IS NULL
    GROUP BY pr.post_id, pr.emoji
  `
  // post_id ごとに [{ emoji, count, mine }] にまとめる
  const reactionsByPost = new Map()
  for (const r of reactionRows) {
    const arr = reactionsByPost.get(Number(r.post_id)) ?? []
    arr.push({ emoji: r.emoji, count: r.count, mine: r.mine })
    reactionsByPost.set(Number(r.post_id), arr)
  }
  // 各 post に reactions を埋め込む
  for (const p of posts) {
    p.reactions = reactionsByPost.get(Number(p.id)) ?? []
  }

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
      homeAbbr={homeAbbr}
      awayAbbr={awayAbbr}
    />
  )
}
