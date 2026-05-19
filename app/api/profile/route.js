import { auth } from '@clerk/nextjs/server'
import sql from '@/lib/db'
import { containsNG } from '@/lib/ng-words'
import { isValidPrefecture } from '@/lib/jp/prefectures'
import { isValidMunicipality } from '@/lib/jp/municipalities'

const CLUB_CHANGE_COOLDOWN_DAYS = 7
const SUPPORTER_SINCE_MIN = 1993
const SUPPORTER_SINCE_MAX = 2030

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
      p.handle,
      p.supported_club_id,
      p.club_changed_at,
      p.jersey_number,
      p.favorite_player_id,
      p.prefecture,
      p.city,
      p.bio,
      p.supporter_since,
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
//   - display_name: 1〜12 文字、NGワードチェック
//   - supported_club_id: teams_master に存在する EAST/WEST/A/B クラブのみ
//   - 推しクラブ変更は 7 日間クールダウン
//   - クラブ変更時は jersey_number / favorite_player_id を NULL クリア
//   - jersey_number / favorite_player_id / prefecture / city / bio / supporter_since は任意
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
  const handleRaw = body.handle == null ? null : String(body.handle).trim()
  const jerseyRaw = body.jersey_number
  const favoritePlayerRaw = body.favorite_player_id
  const prefectureRaw = body.prefecture == null ? null : String(body.prefecture).trim()
  const cityRaw = body.city == null ? null : String(body.city).trim()
  const bioRaw = body.bio == null ? null : String(body.bio).trim()
  const supporterSinceRaw = body.supporter_since

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
    const chars = [...avatarTextRaw]
    if (chars.length === 1 || chars.length === 2) {
      avatarText = avatarTextRaw
    } else {
      return Response.json({ error: 'アイコン文字は1〜2文字までです' }, { status: 400 })
    }
    if (containsNG(avatarText)) {
      return Response.json({ error: 'アイコン文字に使用できない言葉が含まれています' }, { status: 400 })
    }
  }

  // handle のバリデーション (任意、3〜20文字、半角英数 + _-)
  let handle = null
  if (handleRaw && handleRaw.length > 0) {
    if (!/^[a-zA-Z0-9_-]+$/.test(handleRaw)) {
      return Response.json({ error: 'URLハンドルは半角英数と _ - のみ使えます' }, { status: 400 })
    }
    if (handleRaw.length < 3 || handleRaw.length > 20) {
      return Response.json({ error: 'URLハンドルは3〜20文字で入力してください' }, { status: 400 })
    }
    const dup = await sql`
      SELECT clerk_user_id FROM user_profiles WHERE handle = ${handleRaw} AND clerk_user_id <> ${userId}
    `
    if (dup.length > 0) {
      return Response.json({ error: 'そのURLハンドルは既に使われています' }, { status: 409 })
    }
    handle = handleRaw
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

  // jersey_number のバリデーション (null or 1-99 の整数)
  let jerseyNumber = null
  if (jerseyRaw !== null && jerseyRaw !== undefined && jerseyRaw !== '') {
    const n = Number(jerseyRaw)
    if (!Number.isInteger(n) || n < 1 || n > 99) {
      return Response.json({ error: '背番号は1〜99の整数で入力してください' }, { status: 400 })
    }
    jerseyNumber = n
  }

  // favorite_player_id のバリデーション (null or supportedClubId 所属のアクティブ選手)
  let favoritePlayerId = null
  if (favoritePlayerRaw !== null && favoritePlayerRaw !== undefined && favoritePlayerRaw !== '') {
    const n = Number(favoritePlayerRaw)
    if (!Number.isInteger(n) || n <= 0) {
      return Response.json({ error: '推し選手の指定が不正です' }, { status: 400 })
    }
    const playerRows = await sql`
      SELECT id FROM players_master
      WHERE id = ${n} AND team_id = ${supportedClubId} AND is_active = true
    `
    if (playerRows.length === 0) {
      return Response.json({ error: '推し選手は推しクラブの現役選手から選んでください' }, { status: 400 })
    }
    favoritePlayerId = n
  }

  // prefecture / city のバリデーション
  let prefecture = null
  let city = null
  if (prefectureRaw && prefectureRaw.length > 0) {
    if (!isValidPrefecture(prefectureRaw)) {
      return Response.json({ error: '都道府県の指定が不正です' }, { status: 400 })
    }
    prefecture = prefectureRaw
    if (cityRaw && cityRaw.length > 0) {
      if (!isValidMunicipality(prefectureRaw, cityRaw)) {
        return Response.json({ error: '市区町村の指定が不正です' }, { status: 400 })
      }
      city = cityRaw
    }
  }
  // prefecture なしで city だけは不可 (片方クリアは prefecture もクリアと解釈)

  // bio のバリデーション (任意、最大80字、NGワード弾く)
  let bio = null
  if (bioRaw && bioRaw.length > 0) {
    if ([...bioRaw].length > 80) {
      return Response.json({ error: 'ひとことは80文字以内で入力してください' }, { status: 400 })
    }
    if (containsNG(bioRaw)) {
      return Response.json({ error: 'ひとことに使用できない言葉が含まれています' }, { status: 400 })
    }
    bio = bioRaw
  }

  // supporter_since のバリデーション (任意、1993〜2030 の整数)
  let supporterSince = null
  if (supporterSinceRaw !== null && supporterSinceRaw !== undefined && supporterSinceRaw !== '') {
    const n = Number(supporterSinceRaw)
    if (!Number.isInteger(n) || n < SUPPORTER_SINCE_MIN || n > SUPPORTER_SINCE_MAX) {
      return Response.json({ error: `サポ歴は${SUPPORTER_SINCE_MIN}〜${SUPPORTER_SINCE_MAX}年で入力してください` }, { status: 400 })
    }
    supporterSince = n
  }

  // 既存プロフィール取得（クールダウン判定 + クラブ変更時の関連フィールドクリア用）
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

      // クラブ変更時: 推しクラブ依存の jersey_number / favorite_player_id はリクエスト値を使う
      //   フォーム側でクラブ切替時にリセットしている前提だが、サーバー側でも
      //   「favorite_player_id は新クラブの選手で検証済」を担保しているので問題なし
      await sql`
        UPDATE user_profiles SET
          display_name       = ${displayName},
          avatar_text        = ${avatarText},
          handle             = ${handle},
          supported_club_id  = ${supportedClubId},
          jersey_number      = ${jerseyNumber},
          favorite_player_id = ${favoritePlayerId},
          prefecture         = ${prefecture},
          city               = ${city},
          bio                = ${bio},
          supporter_since    = ${supporterSince},
          club_changed_at    = NOW(),
          updated_at         = NOW()
        WHERE clerk_user_id = ${userId}
      `
    } else {
      // クラブ変更なし
      await sql`
        UPDATE user_profiles SET
          display_name       = ${displayName},
          avatar_text        = ${avatarText},
          handle             = ${handle},
          jersey_number      = ${jerseyNumber},
          favorite_player_id = ${favoritePlayerId},
          prefecture         = ${prefecture},
          city               = ${city},
          bio                = ${bio},
          supporter_since    = ${supporterSince},
          updated_at         = NOW()
        WHERE clerk_user_id = ${userId}
      `
    }
  } else {
    // 新規作成
    await sql`
      INSERT INTO user_profiles (
        clerk_user_id, display_name, avatar_text, handle, supported_club_id,
        jersey_number, favorite_player_id, prefecture, city, bio, supporter_since,
        club_changed_at, created_at, updated_at
      ) VALUES (
        ${userId}, ${displayName}, ${avatarText}, ${handle}, ${supportedClubId},
        ${jerseyNumber}, ${favoritePlayerId}, ${prefecture}, ${city}, ${bio}, ${supporterSince},
        NOW(), NOW(), NOW()
      )
    `
  }

  return Response.json({ ok: true })
}
