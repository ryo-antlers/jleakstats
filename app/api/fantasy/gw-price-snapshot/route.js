import sql from '@/lib/db'

/**
 * POST /api/fantasy/gw-price-snapshot
 * body: { gameweek_id }
 * GW開始時点の移籍金をスナップショット保存（移籍金変動前に実行）
 */
export async function POST(request) {
  try {
    const { gameweek_id } = await request.json()
    if (!gameweek_id) return Response.json({ error: 'gameweek_id required' }, { status: 400 })

    await sql`
      CREATE TABLE IF NOT EXISTS fantasy_gw_player_prices (
        gameweek_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        price INTEGER NOT NULL,
        PRIMARY KEY (gameweek_id, player_id)
      )
    `

    const result = await sql`
      INSERT INTO fantasy_gw_player_prices (gameweek_id, player_id, price)
      SELECT ${gameweek_id}, id, price FROM players_master WHERE price IS NOT NULL
      ON CONFLICT DO NOTHING
      RETURNING player_id
    `

    return Response.json({ ok: true, gameweek_id, snapshotted: result.length })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
