import sql from '@/lib/db'
import { fetchPlayersByTeam } from '@/lib/api-football'

// 全チームの選手リストを取得してplayers_masterに登録（is_activeも更新）
export async function GET(request) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const teams = await sql`
    SELECT id FROM teams_master WHERE group_name IN ('EAST', 'WEST')
  `.catch(() => [])

  // API-FOOTBALL から全J1チームの現役ロスターを収集
  const playerMap = new Map() // id -> { team_id, name }
  const errors = []

  for (const team of teams) {
    try {
      let page = 1
      while (true) {
        const res = await fetchPlayersByTeam(team.id, 2026, page)
        if (!res || res.length === 0) break

        for (const entry of res) {
          const p = entry.player
          if (!p?.id) continue
          playerMap.set(p.id, { team_id: team.id, name: p.name })
        }

        // API-FOOTBALLは通常1ページで全員返るが念のため
        if (res.length < 20) break
        page++
      }
    } catch (err) {
      errors.push({ team_id: team.id, error: err.message })
    }
  }

  let upserted = 0
  let deactivated = 0
  if (playerMap.size > 0) {
    const ids = []
    const teamIds = []
    const names = []
    for (const [id, v] of playerMap) {
      ids.push(id)
      teamIds.push(v.team_id)
      names.push(v.name)
    }

    // バルクUPSERT（is_active = true）
    await sql`
      INSERT INTO players_master (id, name_en, team_id, is_active, updated_at)
      SELECT
        unnest(${ids}::int[]),
        unnest(${names}::text[]),
        unnest(${teamIds}::int[]),
        true,
        NOW()
      ON CONFLICT (id) DO UPDATE
        SET name_en = EXCLUDED.name_en,
            team_id = EXCLUDED.team_id,
            is_active = true,
            updated_at = NOW()
    `
    upserted = playerMap.size

    // 今回のロスターに含まれなかったJ1選手を非アクティブ化
    const result = await sql`
      UPDATE players_master pm
      SET is_active = false
      FROM teams_master tm
      WHERE pm.team_id = tm.id
        AND tm.group_name IN ('EAST', 'WEST')
        AND pm.is_active = true
        AND NOT (pm.id = ANY(${ids}::int[]))
    `
    deactivated = result.count ?? 0
  }

  return Response.json({
    ok: true,
    upserted,
    deactivated,
    errors: errors.length > 0 ? errors : undefined,
  })
}
