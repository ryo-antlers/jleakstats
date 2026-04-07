import { auth } from '@clerk/nextjs/server'
import sql from '@/lib/db'

// DF-MF-FW の優先順位（試す順）
const FORMATIONS = [
  { df: 3, mf: 4, fw: 3 },
  { df: 3, mf: 5, fw: 2 },
  { df: 4, mf: 5, fw: 1 },
  { df: 4, mf: 4, fw: 2 },
  { df: 4, mf: 3, fw: 3 },
  { df: 5, mf: 3, fw: 2 },
]

export async function POST() {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // 移籍金（bought_price）降順で全スカッド取得
    const squad = await sql`
      SELECT fs.player_id, fs.bought_price, pm.position
      FROM fantasy_squads fs
      JOIN players_master pm ON fs.player_id = pm.id
      WHERE fs.clerk_user_id = ${userId}
      ORDER BY fs.bought_price DESC
    `

    // ポジション別に分類（価格降順を維持）
    const byPos = { GK: [], DF: [], MF: [], FW: [] }
    for (const p of squad) {
      if (byPos[p.position]) byPos[p.position].push(p.player_id)
    }

    // 移籍金マップ
    const priceMap = {}
    for (const p of squad) priceMap[p.player_id] = Number(p.bought_price ?? 0)

    const totalPrice = (ids) => ids.reduce((s, id) => s + (priceMap[id] ?? 0), 0)

    // 全フォーメーションを評価し、移籍金合計が最大のものを選ぶ
    let starterIds = null
    let bestTotal = -1
    for (const f of FORMATIONS) {
      if (
        byPos.GK.length >= 1 &&
        byPos.DF.length >= f.df &&
        byPos.MF.length >= f.mf &&
        byPos.FW.length >= f.fw
      ) {
        const candidates = [
          byPos.GK[0],
          ...byPos.DF.slice(0, f.df),
          ...byPos.MF.slice(0, f.mf),
          ...byPos.FW.slice(0, f.fw),
        ]
        const total = totalPrice(candidates)
        if (total > bestTotal) {
          bestTotal = total
          starterIds = candidates
        }
      }
    }

    if (!starterIds) {
      return Response.json({ error: '有効なフォーメーションが見つかりません' }, { status: 400 })
    }

    // 全員をベンチにしてからスタメンをセット
    await sql`UPDATE fantasy_squads SET is_starter = false WHERE clerk_user_id = ${userId}`
    await sql`
      UPDATE fantasy_squads SET is_starter = true
      WHERE clerk_user_id = ${userId}
      AND player_id = ANY(${starterIds})
    `

    return Response.json({ ok: true })
  } catch (err) {
    console.error('POST /api/fantasy/squad/auto-starters error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
