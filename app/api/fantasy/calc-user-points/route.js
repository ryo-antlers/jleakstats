import sql from '@/lib/db'

/**
 * POST /api/fantasy/calc-user-points
 * body: { gameweek_id }
 *
 * 現在の is_starter=true の選手のGWポイントを合算して
 * fantasy_users.total_points に付与する。管理者が手動実行。
 */
export async function POST(request) {
  try {
    const { gameweek_id } = await request.json()
    if (!gameweek_id) return Response.json({ error: 'gameweek_id required' }, { status: 400 })

    await sql`
      CREATE TABLE IF NOT EXISTS fantasy_gw_user_points (
        id SERIAL PRIMARY KEY,
        gameweek_id INTEGER NOT NULL,
        clerk_user_id TEXT NOT NULL,
        gw_points INTEGER NOT NULL DEFAULT 0,
        UNIQUE (gameweek_id, clerk_user_id)
      )
    `

    // スナップショット存在確認
    const [snapshotCheck] = await sql`
      SELECT COUNT(*) AS cnt FROM fantasy_gw_starters WHERE gameweek_id = ${gameweek_id}
    `
    if (Number(snapshotCheck.cnt) === 0) {
      return Response.json({ error: 'GWのスナップショットが取得されていません。先にスタメンSnapshotを実行してください。' }, { status: 400 })
    }

    // スナップショットのスタメンでGWポイントをユーザーごとに合算（キャプテンは2倍）
    const userPoints = await sql`
      SELECT
        fgs.clerk_user_id,
        COALESCE(SUM(
          CASE WHEN fgs.player_id = fu.captain_player_id
            THEN COALESCE(fp.points, 0) * 2
            ELSE COALESCE(fp.points, 0)
          END
        ), 0) AS gw_points
      FROM fantasy_gw_starters fgs
      LEFT JOIN fantasy_users fu ON fu.clerk_user_id = fgs.clerk_user_id
      LEFT JOIN (
        SELECT player_id, SUM(points) AS points
        FROM fantasy_points
        WHERE gameweek_id = ${gameweek_id}
        GROUP BY player_id
      ) fp ON fp.player_id = fgs.player_id
      WHERE fgs.gameweek_id = ${gameweek_id}
      GROUP BY fgs.clerk_user_id
    `

    if (userPoints.length === 0) {
      return Response.json({ error: 'スタメン登録ユーザーがいません' }, { status: 400 })
    }

    let updated = 0
    for (const row of userPoints) {
      const newGwPts = Number(row.gw_points)
      const [existing] = await sql`
        SELECT id, gw_points FROM fantasy_gw_user_points
        WHERE gameweek_id = ${gameweek_id} AND clerk_user_id = ${row.clerk_user_id}
      `
      if (existing) {
        const diff = newGwPts - Number(existing.gw_points)
        if (diff !== 0) {
          await sql`UPDATE fantasy_users SET total_points = total_points + ${diff} WHERE clerk_user_id = ${row.clerk_user_id}`
          await sql`UPDATE fantasy_gw_user_points SET gw_points = ${newGwPts} WHERE id = ${existing.id}`
          updated++
        }
      } else {
        await sql`UPDATE fantasy_users SET total_points = COALESCE(total_points, 0) + ${newGwPts} WHERE clerk_user_id = ${row.clerk_user_id}`
        await sql`INSERT INTO fantasy_gw_user_points (gameweek_id, clerk_user_id, gw_points) VALUES (${gameweek_id}, ${row.clerk_user_id}, ${newGwPts})`
        updated++
      }
    }

    return Response.json({ ok: true, gameweek_id, users_updated: updated, breakdown: userPoints })
  } catch (err) {
    console.error('calc-user-points error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
