import { auth } from '@clerk/nextjs/server'
import sql from '@/lib/db'
import { TYPE_META } from '@/lib/fantype/type-meta'
import { decodeAnswers } from '@/lib/fantype/diagnose'

/**
 * GET: 現在ログイン中のユーザーの保存済み FANTYPE タイプ
 *   → { code: 'RSWF', answers: '3_2_...', updated_at: ISO }
 *   未保存 / 未ログイン → 200 で { code: null }
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) return Response.json({ code: null })

  const rows = await sql`
    SELECT fantype_type_code, fantype_answers, fantype_updated_at
    FROM user_profiles
    WHERE clerk_user_id = ${userId}
  `.catch(() => [])
  const row = rows[0]
  if (!row || !row.fantype_type_code) return Response.json({ code: null })

  return Response.json({
    code: row.fantype_type_code,
    answers: row.fantype_answers,
    updated_at: row.fantype_updated_at,
  })
}

/**
 * POST: { code: 'RSWF', answers: '3_2_-1_...' }
 *   → ログイン必須。 user_profiles に UPSERT で保存
 */
export async function POST(req) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const code = String(body?.code ?? '').toUpperCase()
  const answers = String(body?.answers ?? '')

  if (!TYPE_META[code]) {
    return Response.json({ error: 'invalid_code' }, { status: 400 })
  }
  if (!decodeAnswers(answers)) {
    return Response.json({ error: 'invalid_answers' }, { status: 400 })
  }

  // user_profiles の既存行があれば UPDATE、なければ INSERT
  // display_name は NOT NULL 制約あり。プロフィール未設定ユーザー用に「ゲスト」を初期値で入れる
  // (ON CONFLICT 時は display_name を上書きしないので、既存ユーザーの名前は保持される)
  await sql`
    INSERT INTO user_profiles (clerk_user_id, display_name, fantype_type_code, fantype_answers, fantype_updated_at)
    VALUES (${userId}, 'ゲスト', ${code}, ${answers}, NOW())
    ON CONFLICT (clerk_user_id) DO UPDATE
      SET fantype_type_code = EXCLUDED.fantype_type_code,
          fantype_answers   = EXCLUDED.fantype_answers,
          fantype_updated_at = NOW(),
          updated_at      = NOW()
  `
  return Response.json({ ok: true, code })
}
