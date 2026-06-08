import { auth } from '@clerk/nextjs/server'
import sql from '@/lib/db'
import { containsNG } from '@/lib/ng-words'
import { isReservedHandle } from '@/lib/reserved-handles'

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
      p.handle,
      p.supported_club_id,
      p.club_changed_at,
      p.jersey_number,
      p.favorite_player_id,
      p.first_match_fixture_id,
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
//   - クラブ変更時は jersey_number / favorite_player_id / first_match_fixture_id を NULL クリア
//   - 住所は user_profiles から廃止、観戦ノートの「出発地」に移行
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
  const firstMatchFixtureRaw = body.first_match_fixture_id

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

  // handle のバリデーション (必須、3〜20文字、半角英数 + _-、小文字正規化、予約語不可)
  //   - 重複判定は大文字小文字を無視 (Ryo と ryo を同一視してなりすまし防止)
  //   - DB には常に小文字で保存
  if (!handleRaw || handleRaw.length === 0) {
    return Response.json({ error: 'ユーザーIDを入力してください' }, { status: 400 })
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(handleRaw)) {
    return Response.json({ error: 'ユーザーIDは半角英数と _ - のみ使えます' }, { status: 400 })
  }
  if (handleRaw.length < 3 || handleRaw.length > 20) {
    return Response.json({ error: 'ユーザーIDは3〜20文字で入力してください' }, { status: 400 })
  }
  const handle = handleRaw.toLowerCase()
  if (isReservedHandle(handle)) {
    return Response.json({ error: 'そのユーザーIDは使用できません' }, { status: 400 })
  }
  const dup = await sql`
    SELECT clerk_user_id FROM user_profiles WHERE LOWER(handle) = ${handle} AND clerk_user_id <> ${userId}
  `
  if (dup.length > 0) {
    return Response.json({ error: 'そのユーザーIDは既に使われています' }, { status: 409 })
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

  // first_match_fixture_id のバリデーション (任意、推しクラブが関係する終了済試合のみ)
  let firstMatchFixtureId = null
  if (firstMatchFixtureRaw !== null && firstMatchFixtureRaw !== undefined && firstMatchFixtureRaw !== '') {
    const n = Number(firstMatchFixtureRaw)
    if (!Number.isInteger(n) || n <= 0) {
      return Response.json({ error: '初観戦試合の指定が不正です' }, { status: 400 })
    }
    const fxRows = await sql`
      SELECT id FROM fixtures
      WHERE id = ${n}
        AND (home_team_id = ${supportedClubId} OR away_team_id = ${supportedClubId})
        AND finished_at IS NOT NULL
    `
    if (fxRows.length === 0) {
      return Response.json({ error: '初観戦試合は推しクラブの終了済試合から選んでください' }, { status: 400 })
    }
    firstMatchFixtureId = n
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

      // クラブ変更時: 推しクラブ依存の jersey_number / favorite_player_id /
      //   first_match_fixture_id はリクエスト値を使う (新クラブで検証済)
      await sql`
        UPDATE user_profiles SET
          display_name           = ${displayName},
          avatar_text            = ${avatarText},
          handle                 = ${handle},
          supported_club_id      = ${supportedClubId},
          jersey_number          = ${jerseyNumber},
          favorite_player_id     = ${favoritePlayerId},
          first_match_fixture_id = ${firstMatchFixtureId},
          club_changed_at        = NOW(),
          updated_at             = NOW()
        WHERE clerk_user_id = ${userId}
      `
    } else {
      // クラブ変更なし
      await sql`
        UPDATE user_profiles SET
          display_name           = ${displayName},
          avatar_text            = ${avatarText},
          handle                 = ${handle},
          jersey_number          = ${jerseyNumber},
          favorite_player_id     = ${favoritePlayerId},
          first_match_fixture_id = ${firstMatchFixtureId},
          updated_at             = NOW()
        WHERE clerk_user_id = ${userId}
      `
    }
  } else {
    // 新規作成
    await sql`
      INSERT INTO user_profiles (
        clerk_user_id, display_name, avatar_text, handle, supported_club_id,
        jersey_number, favorite_player_id, first_match_fixture_id,
        club_changed_at, created_at, updated_at
      ) VALUES (
        ${userId}, ${displayName}, ${avatarText}, ${handle}, ${supportedClubId},
        ${jerseyNumber}, ${favoritePlayerId}, ${firstMatchFixtureId},
        NOW(), NOW(), NOW()
      )
    `
  }

  return Response.json({ ok: true })
}
