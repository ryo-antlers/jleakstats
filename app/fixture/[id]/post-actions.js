'use server'

import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import sql from '@/lib/db'
import { containsNG } from '@/lib/ng-words'
import { REACTION_EMOJI_SET } from './reaction-emojis'

// ゲスト識別用 Cookie 名 (リアクション用)
const GUEST_COOKIE = 'jleak_guest_id'

// ログイン済みなら clerk_user_id、未ログインなら Cookie に保存した g_<UUID>。
// Cookie が無ければ新規発行してセット (戻り値は新ID)。
async function ensureUserKey() {
  const { userId } = await auth()
  if (userId) return userId
  const jar = await cookies()
  let gid = jar.get(GUEST_COOKIE)?.value
  if (!gid || !/^g_[A-Za-z0-9-]+$/.test(gid)) {
    gid = `g_${randomUUID()}`
    jar.set(GUEST_COOKIE, gid, {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365 * 2,  // 2年
      path: '/',
    })
  }
  return gid
}

/**
 * 掲示板に投稿する Server Action。
 *
 * 権限:
 *   - ログイン必須 (ゲスト不可)
 *   - user_profiles にプロフィールあり
 *   - 本文 1〜1000 文字、NGワードなし
 *   - 試合がDBに存在すること
 */
export async function submitPost(_prev, formData) {
  const { userId } = await auth()
  if (!userId) return { error: '投稿にはログインが必要です' }

  const fixtureId = Number(formData.get('fixture_id'))
  const body = String(formData.get('body') ?? '').trim()
  const parentRaw = formData.get('parent_post_id')
  const parentPostId = parentRaw == null || parentRaw === ''
    ? null
    : Number(parentRaw)

  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    return { error: '試合IDが無効です' }
  }
  if (body.length < 1 || body.length > 1000) {
    return { error: '投稿は 1〜1000 文字で入力してください' }
  }
  if (containsNG(body)) {
    return { error: '使用できない言葉が含まれています' }
  }
  if (parentPostId != null && (!Number.isFinite(parentPostId) || parentPostId <= 0)) {
    return { error: '返信先IDが無効です' }
  }

  // プロフィール確認
  const profiles = await sql`
    SELECT clerk_user_id FROM user_profiles WHERE clerk_user_id = ${userId}
  `
  if (profiles.length === 0) {
    return { error: 'プロフィール未設定です', need_profile: true }
  }

  // 試合存在確認
  const fixtures = await sql`SELECT id FROM fixtures WHERE id = ${fixtureId}`
  if (fixtures.length === 0) {
    return { error: '試合が見つかりません' }
  }

  // 返信の場合、親投稿が同じ fixture に属し、かつ自身がトップレベルであることを保証（ネスト1段）
  if (parentPostId != null) {
    const parents = await sql`
      SELECT id, fixture_id, parent_post_id, deleted_at
      FROM posts WHERE id = ${parentPostId}
    `
    const parent = parents[0]
    if (!parent) return { error: '返信先の投稿が見つかりません' }
    if (parent.fixture_id !== fixtureId) return { error: '返信先の試合が不一致です' }
    if (parent.deleted_at) return { error: '返信先の投稿は削除されています' }
    if (parent.parent_post_id != null) {
      return { error: '返信への返信はできません' }
    }
  }

  await sql`
    INSERT INTO posts (
      fixture_id, clerk_user_id, parent_post_id, body,
      created_at, updated_at
    ) VALUES (
      ${fixtureId}, ${userId}, ${parentPostId}, ${body},
      NOW(), NOW()
    )
  `

  revalidatePath(`/fixture/${fixtureId}`)
  return { success: true }
}

/**
 * 自分の投稿を soft delete する。
 */
export async function deletePost(_prev, formData) {
  const { userId } = await auth()
  if (!userId) return { error: 'ログインが必要です' }

  const postId = Number(formData.get('post_id'))
  if (!Number.isFinite(postId) || postId <= 0) {
    return { error: '投稿IDが無効です' }
  }

  const rows = await sql`
    UPDATE posts
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = ${postId}
      AND clerk_user_id = ${userId}
      AND deleted_at IS NULL
    RETURNING fixture_id
  `
  if (rows.length === 0) {
    return { error: '削除できませんでした（権限または状態エラー）' }
  }

  revalidatePath(`/fixture/${rows[0].fixture_id}`)
  return { success: true }
}

/**
 * 投稿を通報する。同一投稿への重複通報は UNIQUE 制約で弾かれる。
 */
export async function reportPost(_prev, formData) {
  const { userId } = await auth()
  if (!userId) return { error: 'ログインが必要です' }

  const postId = Number(formData.get('post_id'))
  const reasonRaw = String(formData.get('reason') ?? '').trim()
  const reason = reasonRaw.length === 0 ? null : reasonRaw.slice(0, 500)
  if (!Number.isFinite(postId) || postId <= 0) {
    return { error: '投稿IDが無効です' }
  }

  // プロフィール確認
  const profiles = await sql`
    SELECT clerk_user_id FROM user_profiles WHERE clerk_user_id = ${userId}
  `
  if (profiles.length === 0) {
    return { error: 'プロフィール未設定です', need_profile: true }
  }

  // 投稿存在確認（soft-deleted は通報不可）
  const posts = await sql`
    SELECT id FROM posts
    WHERE id = ${postId} AND deleted_at IS NULL
  `
  if (posts.length === 0) {
    return { error: '投稿が見つかりません' }
  }

  try {
    await sql`
      INSERT INTO reports (
        post_id, reporter_clerk_user_id, reason, created_at
      ) VALUES (
        ${postId}, ${userId}, ${reason}, NOW()
      )
    `
  } catch (err) {
    const msg = String(err?.message ?? '')
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return { error: 'この投稿は既に通報済みです' }
    }
    throw err
  }

  return { success: true }
}


/**
 * 投稿のリアクションをトグルする Server Action。
 *
 * 権限:
 *   - ログインユーザー: clerk_user_id で識別
 *   - 未ログイン (ゲスト): Cookie の g_<UUID> で識別 (無ければ自動発行)
 *   - emoji は REACTION_EMOJIS のいずれかであること
 *
 * 既に同じ (post_id, user_key, emoji) があれば削除、なければ追加。
 * DB の clerk_user_id 列にゲストの場合は g_<UUID> をそのまま格納。
 */
export async function toggleReaction(_prev, formData) {
  const userKey = await ensureUserKey()

  const postId = Number(formData.get('post_id'))
  const emoji = String(formData.get('emoji') ?? '').trim()
  if (!Number.isFinite(postId) || postId <= 0) return { error: '投稿IDが無効です' }
  if (!REACTION_EMOJI_SET.has(emoji)) return { error: '無効な絵文字です' }

  // 投稿の存在確認 + fixtureId 取得 (revalidate 用)
  const posts = await sql`SELECT fixture_id FROM posts WHERE id = ${postId} AND deleted_at IS NULL`
  if (posts.length === 0) return { error: '投稿が見つかりません' }
  const fixtureId = posts[0].fixture_id

  const existing = await sql`
    SELECT 1 FROM post_reactions
    WHERE post_id = ${postId} AND clerk_user_id = ${userKey} AND emoji = ${emoji}
  `
  if (existing.length > 0) {
    await sql`
      DELETE FROM post_reactions
      WHERE post_id = ${postId} AND clerk_user_id = ${userKey} AND emoji = ${emoji}
    `
  } else {
    await sql`
      INSERT INTO post_reactions (post_id, clerk_user_id, emoji)
      VALUES (${postId}, ${userKey}, ${emoji})
    `
  }

  revalidatePath(`/fixture/${fixtureId}`)
  return { success: true }
}
