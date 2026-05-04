'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import sql from '@/lib/db'
import { containsNG } from '@/lib/ng-words'

/**
 * 掲示板に投稿する Server Action。
 *
 * 権限:
 *   - ログインユーザー: user_profiles にプロフィールあり
 *   - 未ログイン: guest_name 必須 (1〜30文字)
 *   - 本文 1〜1000 文字、NGワードなし
 *   - 試合がDBに存在すること
 */
export async function submitPost(_prev, formData) {
  const { userId } = await auth()
  const isGuest = !userId

  const fixtureId = Number(formData.get('fixture_id'))
  const body = String(formData.get('body') ?? '').trim()
  const guestName = isGuest ? String(formData.get('guest_name') ?? '').trim() : null
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

  if (isGuest) {
    if (!guestName || guestName.length < 1 || guestName.length > 30) {
      return { error: '名前は 1〜30 文字で入力してください' }
    }
    if (containsNG(guestName)) {
      return { error: '名前に使用できない言葉が含まれています' }
    }
  } else {
    // プロフィール確認 (ログインユーザーのみ)
    const profiles = await sql`
      SELECT clerk_user_id FROM user_profiles WHERE clerk_user_id = ${userId}
    `
    if (profiles.length === 0) {
      return { error: 'プロフィール未設定です', need_profile: true }
    }
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
      fixture_id, clerk_user_id, guest_name, parent_post_id, body,
      created_at, updated_at
    ) VALUES (
      ${fixtureId}, ${isGuest ? null : userId}, ${guestName}, ${parentPostId}, ${body},
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
