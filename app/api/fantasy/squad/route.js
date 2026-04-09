import { auth } from '@clerk/nextjs/server'
import sql from '@/lib/db'
import { checkMarketOpen } from '@/lib/fantasy-market'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const squad = await sql`
    SELECT
      fs.player_id, fs.bought_price, fs.is_starter, COALESCE(fs.sort_order, 0) AS sort_order,
      COALESCE(fs.pos_offset_x, 0) AS pos_offset_x, COALESCE(fs.pos_offset_y, 0) AS pos_offset_y,
      pm.name_ja, pm.name_en, pm.position, pm.price, pm.team_id, pm.no,
      tm.abbr AS team_abbr, tm.color_primary AS team_color,
      (fs.player_id = fu.captain_player_id) AS is_captain
    FROM fantasy_squads fs
    JOIN players_master pm ON fs.player_id = pm.id
    LEFT JOIN teams_master tm ON pm.team_id = tm.id
    LEFT JOIN fantasy_users fu ON fu.clerk_user_id = fs.clerk_user_id
    WHERE fs.clerk_user_id = ${userId}
    ORDER BY COALESCE(fs.sort_order, 0), pm.position, pm.name_ja
  `
  return Response.json({ squad })
}

export async function POST(request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const marketError = await checkMarketOpen()
    if (marketError) return Response.json({ error: marketError }, { status: 403 })

    const body = await request.json()
    const player_id = parseInt(body.player_id)

    // ユーザー情報取得
    const [user] = await sql`SELECT * FROM fantasy_users WHERE clerk_user_id = ${userId}`
    if (!user) return Response.json({ error: 'ユーザーが見つかりません' }, { status: 404 })

    // 選手情報取得
    const [player] = await sql`SELECT * FROM players_master WHERE id = ${player_id}`
    if (!player) return Response.json({ error: '選手が見つかりません' }, { status: 404 })
    if (!player.price) return Response.json({ error: 'この選手は価格未設定です' }, { status: 400 })

    // 現在のスカッド取得（ポジション・チーム情報も含む）
    const squad = await sql`
      SELECT fs.player_id, pm.position, pm.team_id
      FROM fantasy_squads fs
      JOIN players_master pm ON fs.player_id = pm.id
      WHERE fs.clerk_user_id = ${userId}
    `

    // 重複チェック
    if (squad.some(s => s.player_id === player_id)) {
      return Response.json({ error: 'すでにスカッドに入っています' }, { status: 400 })
    }

    // 上限チェック（最大20人）
    if (squad.length >= 20) {
      return Response.json({ error: 'スカッドは最大20人です' }, { status: 400 })
    }

    // ポジション別上限チェック
    const posCounts = { GK: 0, DF: 0, MF: 0, FW: 0 }
    for (const s of squad) {
      if (s.position in posCounts) posCounts[s.position]++
    }
    const posLimits = { GK: 2, DF: 6, MF: 7, FW: 5 }
    if ((posCounts[player.position] ?? 0) >= (posLimits[player.position] ?? 99)) {
      return Response.json({ error: `${player.position}はこれ以上追加できません` }, { status: 400 })
    }

    // クラブ別上限チェック（1クラブ最大3人）
    const clubCount = squad.filter(s => s.team_id === player.team_id).length
    if (clubCount >= 3) {
      return Response.json({ error: '同じクラブから3人以上は獲得できません' }, { status: 400 })
    }

    // 予算チェック（価格単位=万円、予算単位=1000円 → ×10で換算）
    const cost = player.price * 10
    if (user.budget < cost) {
      return Response.json({ error: '残高が不足しています' }, { status: 400 })
    }

    // 追加 & 残高更新
    await sql`
      INSERT INTO fantasy_squads (clerk_user_id, player_id, bought_price)
      VALUES (${userId}, ${player_id}, ${player.price})
    `
    await sql`
      UPDATE fantasy_users SET budget = budget - ${cost} WHERE clerk_user_id = ${userId}
    `

    return Response.json({ ok: true })
  } catch (err) {
    console.error('POST /api/fantasy/squad error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const player_id = parseInt(body.player_id)
    const no_fee = body.no_fee === true

    // no_fee=true は新規登録フロー（new_squad）なので締め切りチェック不要
    if (!no_fee) {
      const marketError = await checkMarketOpen()
      if (marketError) return Response.json({ error: marketError }, { status: 403 })
    }

    const [entry] = await sql`
      SELECT fs.bought_price FROM fantasy_squads fs
      WHERE fs.clerk_user_id = ${userId} AND fs.player_id = ${player_id}
    `
    if (!entry) return Response.json({ error: '選手が見つかりません' }, { status: 404 })

    // new_squad（no_fee）時はポジション最低人数チェックをスキップ
    if (!no_fee) {
      const POS_MIN = { GK: 1, DF: 3, MF: 4, FW: 1 }
      const remainingSquad = await sql`
        SELECT pm.position FROM fantasy_squads fs
        JOIN players_master pm ON fs.player_id = pm.id
        WHERE fs.clerk_user_id = ${userId} AND fs.player_id != ${player_id}
      `
      const remainingCounts = { GK: 0, DF: 0, MF: 0, FW: 0 }
      for (const p of remainingSquad) if (p.position in remainingCounts) remainingCounts[p.position]++
      const [sellingPlayer] = await sql`SELECT position FROM players_master WHERE id = ${player_id}`
      const pos = sellingPlayer?.position
      if (pos && POS_MIN[pos] && remainingCounts[pos] < POS_MIN[pos]) {
        return Response.json({ error: `${pos}は最低${POS_MIN[pos]}人必要です` }, { status: 400 })
      }
    }

    const sellPrice = no_fee ? entry.bought_price : Math.floor(entry.bought_price * 0.95)
    const refund = sellPrice * 10

    await sql`DELETE FROM fantasy_squads WHERE clerk_user_id = ${userId} AND player_id = ${player_id}`
    await sql`UPDATE fantasy_users SET budget = budget + ${refund} WHERE clerk_user_id = ${userId}`

    return Response.json({ ok: true, sell_price: sellPrice })
  } catch (err) {
    console.error('DELETE /api/fantasy/squad error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
