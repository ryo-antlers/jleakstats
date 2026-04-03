import sql from '@/lib/db'
import { fetchOdds } from '@/lib/api-football'

// 開催前試合のオッズを同期
export async function GET(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // 7日以内に開催される未終了試合を対象（オッズは毎日変動するので既取得分も更新）
    const in7days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const fixtures = await sql`
      SELECT id FROM fixtures
      WHERE season = 2026
        AND status NOT IN ('FT', 'AET', 'PEN')
        AND date <= ${in7days}
      ORDER BY date ASC
      LIMIT 20
    `

    let processed = 0
    const errors = []

    for (const { id } of fixtures) {
      try {
        const oddsRes = await Promise.race([
          fetchOdds(id),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
        ])
        if (oddsRes.length > 0) {
          await sql`DELETE FROM fixture_odds WHERE fixture_id = ${id}`
          for (const bookmaker of oddsRes[0].bookmakers) {
            for (const bet of bookmaker.bets) {
              for (const val of bet.values) {
                await sql`
                  INSERT INTO fixture_odds (
                    fixture_id, bookmaker_id, bookmaker_name,
                    bet_id, bet_name, value, odd
                  ) VALUES (
                    ${id}, ${bookmaker.id}, ${bookmaker.name},
                    ${bet.id}, ${bet.name}, ${String(val.value)},
                    ${parseFloat(val.odd)}
                  )
                  ON CONFLICT (fixture_id, bookmaker_id, bet_id, value) DO UPDATE SET
                    odd = EXCLUDED.odd
                `
              }
            }
          }
          processed++
        }
        await new Promise(r => setTimeout(r, 200))
      } catch (err) {
        errors.push({ id, error: err.message })
      }
    }

    return Response.json({ ok: true, processed, errors: errors.length > 0 ? errors : undefined })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
