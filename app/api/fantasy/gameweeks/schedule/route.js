import sql from '@/lib/db'

export async function GET() {
  const rows = await sql`
    SELECT
      fg.id,
      fg.gw_number,
      fg.start_date,
      fg.end_date,
      fg.status,
      MIN(f.date) AS first_kickoff,
      MAX(f.date) AS last_kickoff,
      COUNT(f.id) AS fixture_count
    FROM fantasy_gameweeks fg
    LEFT JOIN fantasy_gameweek_fixtures fgf ON fgf.gameweek_id = fg.id
    LEFT JOIN fixtures f ON f.id = fgf.fixture_id
    GROUP BY fg.id
    ORDER BY fg.gw_number
  `

  const gameweeks = rows.map(gw => {
    const first = gw.first_kickoff ? new Date(gw.first_kickoff) : null
    const last = gw.last_kickoff ? new Date(gw.last_kickoff) : null
    // 締切：最初のキックオフの3時間前（JST）
    const deadline = first ? new Date(first.getTime() - 3 * 60 * 60 * 1000) : null
    // GW終了：最後のキックオフの3時間後
    const gwEnd = last ? new Date(last.getTime() + 3 * 60 * 60 * 1000) : null
    // 移籍市場オープン：最後のキックオフの翌日12:00 JST
    let marketOpen = null
    if (last) {
      const jstOffset = 9 * 60 * 60 * 1000
      const lastJST = new Date(last.getTime() + jstOffset)
      // 翌日の日付（JST）
      const nextDay = new Date(lastJST)
      nextDay.setUTCDate(nextDay.getUTCDate() + 1)
      // 翌日12:00 JSTをUTCに変換（JST12:00 = UTC03:00）
      marketOpen = new Date(Date.UTC(nextDay.getUTCFullYear(), nextDay.getUTCMonth(), nextDay.getUTCDate(), 3, 0, 0))
    }

    return {
      id: gw.id,
      gw_number: gw.gw_number,
      status: gw.status,
      start_date: gw.start_date,
      end_date: gw.end_date,
      fixture_count: Number(gw.fixture_count),
      deadline: deadline?.toISOString() ?? null,
      gw_end: gwEnd?.toISOString() ?? null,
      market_open: marketOpen?.toISOString() ?? null,
    }
  })

  return Response.json({ gameweeks }, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' },
  })
}
