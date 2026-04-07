import sql from '@/lib/db'

// GW1〜指定GWまでを順番にポイント計算→価格更新する一括処理
// GET /api/fantasy/backfill?until_gw=9
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const untilGw = parseInt(searchParams.get('until_gw') ?? '99')

  try {
    const gameweeks = await sql`
      SELECT id, gw_number FROM fantasy_gameweeks
      WHERE gw_number <= ${untilGw}
      ORDER BY gw_number ASC
    `

    const results = []

    for (const gw of gameweeks) {
      // ポイント計算
      const calcRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/fantasy/calc-points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameweek_id: gw.id }),
      })
      const calcData = await calcRes.json()

      // 価格更新
      const priceRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/fantasy/update-prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameweek_id: gw.id }),
      })
      const priceData = await priceRes.json()

      results.push({
        gw: gw.gw_number,
        calc: calcData.ok ? `${calcData.players}選手` : `❌ ${calcData.error}`,
        prices: priceData.ok ? `${priceData.updated}件更新` : `❌ ${priceData.error}`,
      })
    }

    return Response.json({ ok: true, results })
  } catch (err) {
    console.error('backfill error:', err)
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
