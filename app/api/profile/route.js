import { auth } from '@clerk/nextjs/server'
import sql from '@/lib/db'
import { containsNG } from '@/lib/ng-words'

const CLUB_CHANGE_COOLDOWN_DAYS = 7

// GET: 現在のユーザーのプロフィールを取得
//   - プロフィール未作成なら 404
//   - 推しクラブ変更の残りクールダウン秒数も返す
export async function GET() {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await sql`
    SELECT
      p.clerk_user_id,
      p.display_name,
      p.avatar_text,
      p.supported_club_id,
      p.club_changed_at,
      t.name_ja AS club_name_ja,
      t.color_primary AS club_color,
      GREATEST(
        0,
        EXTRACT(EPOCH FROM (
          p.club_changed_at + INTERVAL '7 days' - NOW()
        ))
      )::int AS club_cooldown_seconds
    FROM user_profiles p
    LEFT JOIN teams_master t ON t.id = p.supported_club_id
    WHERE p.clerk_user_id = ${userId}
  `

  if (rows.length === 0) {
    return Response.json({ profile: null }, { status: 200 })
  }

  return Response.json({ profile: rows[0] })
}

// POST: プロフィール作成 or 更新
//   - display_name: 1〜30 文字、NGワードチェック
//   - supported_club_id: teams_master に存在する EAST/WEST クラブのみ
//   - 推しクラブ変更は 7 日間クールダウン（JS チェックのみ、DBトリガーなし）
export async function POST(request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: '不正なリクエストボディ' }, { status: 400 })
  }

  const displayName = String(body.display_name ?? '').trim()
  const supportedClubId = Number(body.supported_club_id)
  const avatarTextRaw = body.avatar_text == null ? null : String(body.avatar_text).trim()

  // display_name のバリデーション
  if (displayName.length < 1 || displayName.length > 12) {
    return Response.json({ error: 'ユーザー名は1〜12文字で入力してください' }, { status: 400 })
  }
  if (containsNG(displayName)) {
    return Response.json({ error: 'ユーザー名に使用できない言葉が含まれています' }, { status: 400 })
  }

  // avatar_text のバリデーション (null = 未設定 / 1〜2文字、言語不問)
  let avatarText = null
  if (avatarTextRaw && avatarTextRaw.length > 0) {
    const chars = [...avatarTextRaw]  // multibyte-aware split
    if (chars.length === 1 || chars.length === 2) {
      avatarText = avatarTextRaw
    } else {
      return Response.json({ error: 'アイコン文字は1〜2文字までです' }, { status: 400 })
    }
    if (containsNG(avatarText)) {
      return Response.json({ error: 'アイコン文字に使用できない言葉が含まれています' }, { status: 400 })
    }
  }

  // supported_club_id のバリデーション (J1/J2/J3 全グループ)
  if (!Number.isInteger(supportedClubId) || supportedClubId <= 0) {
    return Response.json({ error: '推しクラブを選んでください' }, { status: 400 })
  }
  const clubRows = await sql`
    SELECT id FROM teams_master
    WHERE id = ${supportedClubId}
      AND group_name IN ('EAST', 'WEST', 'EAST-A', 'WEST-A', 'EAST-B', 'WEST-B')
  `
  if (clubRows.length === 0) {
    return Response.json({ error: '選択されたクラブは登録されていません' }, { status: 400 })
  }

  // 既存プロフィールを取得（クールダウン判定用）
  const existing = await sql`
    SELECT supported_club_id, club_changed_at
    FROM user_profiles
    WHERE clerk_user_id = ${userId}
  `

  if (existing.length > 0) {
    const cur = existing[0]
    const isClubChanged = cur.supported_club_id !== supportedClubId

    if (isClubChanged) {
      // 7日クールダウン判定
      const changedAt = new Date(cur.club_changed_at).getTime()
      const now = Date.now()
      const cooldownMs = CLUB_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
      if (now < changedAt + cooldownMs) {
        const nextAvailable = new Date(changedAt + cooldownMs).toISOString()
        return Response.json(
          {
            error: `推しクラブの変更は ${CLUB_CHANGE_COOLDOWN_DAYS} 日間のクールダウン中です`,
            next_available_at: nextAvailable,
          },
          { status: 403 },
        )
      }

      // クラブ変更あり → club_changed_at も更新
      await sql`
        UPDATE user_profiles SET
          display_name      = ${displayName},
          avatar_text       = ${avatarText},
          supported_club_id = ${supportedClubId},
          club_changed_at   = NOW(),
          updated_at        = NOW()
        WHERE clerk_user_id = ${userId}
      `
    } else {
      // display_name と avatar_text のみ更新
      await sql`
        UPDATE user_profiles SET
          display_name = ${displayName},
          avatar_text  = ${avatarText},
          updated_at   = NOW()
        WHERE clerk_user_id = ${userId}
      `
    }
  } else {
    // 新規作成
    await sql`
      INSERT INTO user_profiles (
        clerk_user_id, display_name, avatar_text, supported_club_id,
        club_changed_at, created_at, updated_at
      ) VALUES (
        ${userId}, ${displayName}, ${avatarText}, ${supportedClubId},
        NOW(), NOW(), NOW()
      )
    `
  }

  return Response.json({ ok: true })
}
