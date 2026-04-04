import sql from '@/lib/db'

// 今日（JST）に試合があるか確認
export async function GET(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // JSTの今日の開始・終了をUTCで計算
  const now = new Date()
  const jstOffset = 9 * 60 * 60 * 1000
  const jstNow = new Date(now.getTime() + jstOffset)
  const jstDateStr = jstNow.toISOString().slice(0, 10) // 'YYYY-MM-DD'

  const todayStart = new Date(`${jstDateStr}T00:00:00+09:00`)
  const todayEnd   = new Date(`${jstDateStr}T23:59:59+09:00`)

  const result = await sql`
    SELECT COUNT(*) AS count FROM fixtures
    WHERE season = 2026
      AND date >= ${todayStart.toISOString()}
      AND date <= ${todayEnd.toISOString()}
  `

  const hasMatches = parseInt(result[0].count) > 0
  return Response.json({ hasMatches, date: jstDateStr })
}
