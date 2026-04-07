import sql from '@/lib/db'

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS fantasy_gw_starters (
      id SERIAL PRIMARY KEY,
      gameweek_id INTEGER NOT NULL REFERENCES fantasy_gameweeks(id),
      clerk_user_id TEXT NOT NULL,
      player_id INTEGER NOT NULL,
      UNIQUE (gameweek_id, clerk_user_id, player_id)
    )
  `
}

/**
 * POST /api/fantasy/gw-starters
 * body: { gameweek_id }
 *
 * 全ユーザーの現在の is_starter=true をスナップショットとして保存する。
 * 締め切り時刻に管理者（またはcron）が叩く。
 */
export async function POST(request) {
  try {
    await ensureTable()
    const { gameweek_id } = await request.json()
    if (!gameweek_id) return Response.json({ error: 'gameweek_id required' }, { status: 400 })

    // 既存スナップショットを削除（再取得対応）
    await sql`DELETE FROM fantasy_gw_starters WHERE gameweek_id = ${gameweek_id}`

    // 全ユーザーのis_starter=trueをスナップショット
    const starters = await sql`
      SELECT clerk_user_id, player_id
      FROM fantasy_squads
      WHERE is_starter = true
    `

    for (const s of starters) {
      await sql`
        INSERT INTO fantasy_gw_starters (gameweek_id, clerk_user_id, player_id)
        VALUES (${gameweek_id}, ${s.clerk_user_id}, ${s.player_id})
        ON CONFLICT DO NOTHING
      `
    }

    return Response.json({ ok: true, gameweek_id, snapshotted: starters.length })
  } catch (err) {
    console.error('POST /api/fantasy/gw-starters error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}

/**
 * GET /api/fantasy/gw-starters?gameweek_id=X
 * 特定GWのスナップショット確認用
 */
export async function GET(request) {
  try {
    await ensureTable()
    const { searchParams } = new URL(request.url)
    const gameweek_id = searchParams.get('gameweek_id')
    if (!gameweek_id) return Response.json({ error: 'gameweek_id required' }, { status: 400 })

    const rows = await sql`
      SELECT clerk_user_id, COUNT(*) AS count
      FROM fantasy_gw_starters
      WHERE gameweek_id = ${gameweek_id}
      GROUP BY clerk_user_id
    `
    return Response.json({ gameweek_id, users: rows })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
