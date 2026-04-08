import { auth } from '@clerk/nextjs/server'
import sql from '@/lib/db'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const [user] = await sql`
    SELECT * FROM fantasy_users WHERE clerk_user_id = ${userId}
  `
  return Response.json({ user: user ?? null })
}

export async function PATCH(request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { username, team_name, team_color } = await request.json()
  if (!username?.trim() || !team_name?.trim()) {
    return Response.json({ error: '名前とチーム名を入力してください' }, { status: 400 })
  }

  const [existing] = await sql`
    SELECT id FROM fantasy_users WHERE username = ${username.trim()} AND clerk_user_id != ${userId}
  `
  if (existing) {
    return Response.json({ error: 'そのユーザー名は既に使われています' }, { status: 400 })
  }

  const [user] = await sql`
    UPDATE fantasy_users SET
      username = ${username.trim()},
      team_name = ${team_name.trim()},
      team_color = ${team_color ?? '#e00000'}
    WHERE clerk_user_id = ${userId}
    RETURNING *
  `
  if (!user) return Response.json({ error: 'ユーザーが見つかりません' }, { status: 404 })
  return Response.json({ user })
}

export async function POST(request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { username, team_name, team_color } = await request.json()
  if (!username?.trim() || !team_name?.trim()) {
    return Response.json({ error: '名前とチーム名を入力してください' }, { status: 400 })
  }

  // username重複チェック
  const [existing] = await sql`
    SELECT id FROM fantasy_users WHERE username = ${username.trim()} AND clerk_user_id != ${userId}
  `
  if (existing) {
    return Response.json({ error: 'そのユーザー名は既に使われています' }, { status: 400 })
  }

  // 既存スカッドをクリア（再登録時のリセット）
  await sql`DELETE FROM fantasy_squads WHERE clerk_user_id = ${userId}`

  const [user] = await sql`
    INSERT INTO fantasy_users (clerk_user_id, username, team_name, budget, team_color)
    VALUES (${userId}, ${username.trim()}, ${team_name.trim()}, 1000000, ${team_color ?? '#e00000'})
    ON CONFLICT (clerk_user_id) DO UPDATE SET
      username = EXCLUDED.username,
      team_name = EXCLUDED.team_name,
      budget = 1000000,
      team_color = EXCLUDED.team_color
    RETURNING *
  `
  return Response.json({ user })
}
