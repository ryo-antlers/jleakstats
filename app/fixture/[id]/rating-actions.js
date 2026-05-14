'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import sql from '@/lib/db'

// 有効な採点値: 4.0〜8.5 の 0.1 刻み (46段階)
// NUMERIC(3,1) で DB 側は1桁精度に丸められるため、JS側でも同じ精度で判定する
const VALID_SCORE_MIN = 4.0
const VALID_SCORE_MAX = 8.5

function isValidScore(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return false
  if (n < VALID_SCORE_MIN || n > VALID_SCORE_MAX) return false
  // 0.1 刻みチェック (浮動小数誤差対応)
  return Math.abs(n * 10 - Math.round(n * 10)) < 1e-9
}

/**
 * 採点をまとめて保存する Server Action。
 *
 * FormData:
 *   fixture_id:           試合ID
 *   rating_<player_id>:   採点値 ("1.0"〜"10.0") / "skip" / "" (未採点=変更なし)
 *
 * 権限チェック:
 *   1. ログイン済み (Clerk)
 *   2. user_profiles にプロフィールあり
 *   3. 試合終了済み (fixtures.finished_at IS NOT NULL)
 *   4. 推しクラブの「次の試合のキックオフ」前 (次戦未開催)
 *   5. 推しクラブがこの試合に出場
 *   6. 採点対象選手は推しクラブの fixture_lineups に存在
 */
export async function saveRatings(_prev, formData) {
  const { userId } = await auth()
  if (!userId) return { error: 'ログインが必要です' }

  const fixtureId = Number(formData.get('fixture_id'))
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    return { error: '試合IDが無効です' }
  }

  // プロフィール + 推しクラブ
  const profiles = await sql`
    SELECT supported_club_id
    FROM user_profiles
    WHERE clerk_user_id = ${userId}
  `
  if (profiles.length === 0) {
    return { error: 'プロフィール未設定です', need_profile: true }
  }
  const supportedClubId = profiles[0].supported_club_id

  // 試合情報（締切判定: 推しクラブの次戦キックオフ前）
  const fixtures = await sql`
    SELECT
      f.id,
      f.finished_at,
      (
        f.finished_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM fixtures f2
          WHERE (f2.home_team_id = ${supportedClubId} OR f2.away_team_id = ${supportedClubId})
            AND f2.date > f.date
            AND f2.date <= NOW()
        )
      ) AS ratable
    FROM fixtures f
    WHERE f.id = ${fixtureId}
  `
  if (fixtures.length === 0) {
    return { error: '試合が見つかりません' }
  }
  const f = fixtures[0]
  if (!f.finished_at) {
    return { error: '試合終了後に採点できます' }
  }
  if (!f.ratable) {
    return {
      error: '採点締切を過ぎました（推しクラブの次の試合のキックオフまで）',
    }
  }

  // 推しクラブの出場選手 (ratable な player_id 集合)
  const lineupRows = await sql`
    SELECT DISTINCT player_id
    FROM fixture_lineups
    WHERE fixture_id = ${fixtureId}
      AND team_id = ${supportedClubId}
      AND player_id IS NOT NULL
  `
  const validPlayerIds = new Set(lineupRows.map(r => r.player_id))
  if (validPlayerIds.size === 0) {
    return { error: 'あなたの推しクラブはこの試合に出場していません' }
  }

  // FormData を採点行に変換
  const rows = []
  for (const [key, rawVal] of formData.entries()) {
    if (!key.startsWith('rating_')) continue
    const playerId = Number(key.replace('rating_', ''))
    if (!Number.isFinite(playerId)) continue

    const val = String(rawVal ?? '').trim()
    if (val === '' || val === 'none') continue

    if (!validPlayerIds.has(playerId)) {
      return { error: `採点できない選手が含まれています (player_id=${playerId})` }
    }

    if (val === 'skip') {
      rows.push({ playerId, score: null, skipped: true })
      continue
    }

    // 0.1 刻みで丸める (UIの浮動小数誤差対応)
    const rawScore = Number(val)
    const score = Math.round(rawScore * 10) / 10
    if (!isValidScore(score)) {
      return {
        error: `無効な採点値 (player_id=${playerId}, value=${val}) ${VALID_SCORE_MIN}〜${VALID_SCORE_MAX} の範囲で入力してください`,
      }
    }
    rows.push({ playerId, score, skipped: false })
  }

  if (rows.length === 0) {
    return { error: '採点が1件もありません' }
  }

  // upsert (ループで ON CONFLICT 更新)
  for (const row of rows) {
    await sql`
      INSERT INTO ratings (
        clerk_user_id, fixture_id, player_id, score, skipped,
        created_at, updated_at
      ) VALUES (
        ${userId}, ${fixtureId}, ${row.playerId}, ${row.score}, ${row.skipped},
        NOW(), NOW()
      )
      ON CONFLICT (clerk_user_id, fixture_id, player_id) DO UPDATE SET
        score      = EXCLUDED.score,
        skipped    = EXCLUDED.skipped,
        updated_at = NOW()
    `
  }

  revalidatePath(`/fixture/${fixtureId}`)
  return { success: true, saved: rows.length }
}

/**
 * 採点を削除（自分のだけ、採点締切内のみ＝推しクラブの次戦キックオフ前）。
 */
export async function deleteRating(_prev, formData) {
  const { userId } = await auth()
  if (!userId) return { error: 'ログインが必要です' }

  const fixtureId = Number(formData.get('fixture_id'))
  const playerId = Number(formData.get('player_id'))
  if (!Number.isFinite(fixtureId) || !Number.isFinite(playerId)) {
    return { error: 'パラメータが無効です' }
  }

  // 削除も推しクラブの次戦キックオフを基準にするため supported_club_id が必要
  const profiles = await sql`
    SELECT supported_club_id
    FROM user_profiles
    WHERE clerk_user_id = ${userId}
  `
  if (profiles.length === 0) {
    return { error: 'プロフィール未設定です', need_profile: true }
  }
  const supportedClubId = profiles[0].supported_club_id

  const fixtures = await sql`
    SELECT
      (
        f.finished_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM fixtures f2
          WHERE (f2.home_team_id = ${supportedClubId} OR f2.away_team_id = ${supportedClubId})
            AND f2.date > f.date
            AND f2.date <= NOW()
        )
      ) AS ratable
    FROM fixtures f
    WHERE f.id = ${fixtureId}
  `
  if (fixtures.length === 0 || !fixtures[0].ratable) {
    return { error: '採点締切を過ぎたため削除できません' }
  }

  await sql`
    DELETE FROM ratings
    WHERE clerk_user_id = ${userId}
      AND fixture_id = ${fixtureId}
      AND player_id = ${playerId}
  `

  revalidatePath(`/fixture/${fixtureId}`)
  return { success: true }
}
