import sql from '@/lib/db'

// GW一覧 + 含まれるfixture
export async function GET() {
  const gameweeks = await sql`
    SELECT fg.id, fg.gw_number, fg.start_date, fg.end_date, fg.status,
           COUNT(fgf.fixture_id) AS fixture_count
    FROM fantasy_gameweeks fg
    LEFT JOIN fantasy_gameweek_fixtures fgf ON fgf.gameweek_id = fg.id
    GROUP BY fg.id
    ORDER BY fg.gw_number
  `
  return Response.json({ gameweeks })
}

// GWのfixture一覧を追加・削除
export async function PATCH(request) {
  try {
    const { gameweek_id, add_fixture_ids, remove_fixture_ids } = await request.json()
    if (add_fixture_ids?.length) {
      for (const fid of add_fixture_ids) {
        await sql`
          INSERT INTO fantasy_gameweek_fixtures (gameweek_id, fixture_id)
          VALUES (${gameweek_id}, ${fid})
          ON CONFLICT DO NOTHING
        `
      }
    }
    if (remove_fixture_ids?.length) {
      for (const fid of remove_fixture_ids) {
        await sql`
          DELETE FROM fantasy_gameweek_fixtures
          WHERE gameweek_id = ${gameweek_id} AND fixture_id = ${fid}
        `
      }
    }
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// GWのステータス更新
export async function PUT(request) {
  try {
    const { id, status } = await request.json()
    await sql`UPDATE fantasy_gameweeks SET status = ${status} WHERE id = ${id}`
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
