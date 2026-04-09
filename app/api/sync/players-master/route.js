import sql from '@/lib/db'
import { fetchPlayersByTeam } from '@/lib/api-football'

// 全チームの選手リストを取得してplayers_masterに登録
export async function GET(request) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const teams = await sql`
    SELECT id FROM teams_master WHERE group_name IN ('EAST', 'WEST')
  `.catch(() => [])

  let totalUpserted = 0
  const errors = []

  for (const team of teams) {
    try {
      // ページネーション対応（選手が多いチームは複数ページ）
      let page = 1
      while (true) {
        const res = await fetchPlayersByTeam(team.id, 2026, page)
        if (!res || res.length === 0) break

        for (const entry of res) {
          const p = entry.player
          if (!p?.id) continue
          const result = await sql`
            UPDATE players_master
            SET name_en = ${p.name}, team_id = ${team.id}, updated_at = NOW()
            WHERE id = ${p.id}
          `
          if (result.count > 0) totalUpserted++
        }

        // API-FOOTBALLは通常1ページで全員返るが念のため
        if (res.length < 20) break
        page++
      }
    } catch (err) {
      errors.push({ team_id: team.id, error: err.message })
    }
  }

  return Response.json({
    ok: true,
    totalUpserted,
    errors: errors.length > 0 ? errors : undefined,
  })
}
