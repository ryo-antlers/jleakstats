import { auth } from '@clerk/nextjs/server'
import sql from '@/lib/db'
import { checkMarketOpen } from '@/lib/fantasy-market'

// スタメン保存
export async function POST(request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const marketError = await checkMarketOpen()
    if (marketError) return Response.json({ error: marketError }, { status: 403 })

    const { starter_ids, formation } = await request.json()
    if (!Array.isArray(starter_ids) || starter_ids.length !== 11) {
      return Response.json({ error: 'スタメンは11人です' }, { status: 400 })
    }

    // 全選手をis_starter=falseにリセット
    await sql`
      UPDATE fantasy_squads SET is_starter = false, sort_order = 0
      WHERE clerk_user_id = ${userId}
    `
    // 指定選手をis_starter=true、順番を保存
    for (let i = 0; i < starter_ids.length; i++) {
      await sql`
        UPDATE fantasy_squads SET is_starter = true, sort_order = ${i + 1}
        WHERE clerk_user_id = ${userId} AND player_id = ${starter_ids[i]}
      `
    }

    return Response.json({ ok: true })
  } catch (err) {
    console.error('POST /api/fantasy/starters error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
