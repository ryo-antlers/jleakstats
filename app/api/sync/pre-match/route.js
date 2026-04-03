import sql from '@/lib/db'
import { fetchFixtureLineups } from '@/lib/api-football'

// 試合開始0〜2時間前のラインナップを取得して保存
export async function GET(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const from = new Date(now.getTime() - 30 * 60 * 1000)   // 30分前（発表済みの可能性）
    const to   = new Date(now.getTime() + 2 * 60 * 60 * 1000) // 2時間後

    // 対象：未開始 かつ 開始時刻が30分前〜2時間後 かつ ラインナップ未取得
    const fixtures = await sql`
      SELECT f.id FROM fixtures f
      LEFT JOIN fixture_lineups fl ON fl.fixture_id = f.id
      WHERE f.status = 'NS'
        AND f.season = 2026
        AND f.date >= ${from.toISOString()}
        AND f.date <= ${to.toISOString()}
        AND fl.fixture_id IS NULL
    `.catch(() => [])

    if (fixtures.length === 0) {
      return Response.json({ ok: true, message: '対象試合なし', processed: 0 })
    }

    let processed = 0
    const errors = []

    for (const { id } of fixtures) {
      try {
        const lineupsRes = await fetchFixtureLineups(id).catch(() => [])
        if (lineupsRes.length === 0) continue

        await sql`DELETE FROM fixture_lineups WHERE fixture_id = ${id}`
        for (const teamData of lineupsRes) {
          const teamId = teamData.team.id
          const formation = teamData.formation
          const coachName = teamData.coach?.name ?? null
          for (const entry of teamData.startXI) {
            const p = entry.player
            await sql`
              INSERT INTO fixture_lineups (
                fixture_id, team_id, coach_name, formation,
                player_id, player_name_en, number, position, grid, is_starter
              ) VALUES (
                ${id}, ${teamId}, ${coachName}, ${formation},
                ${p.id}, ${p.name}, ${p.number}, ${p.pos}, ${p.grid}, true
              )
            `
          }
          for (const entry of teamData.substitutes) {
            const p = entry.player
            await sql`
              INSERT INTO fixture_lineups (
                fixture_id, team_id, coach_name, formation,
                player_id, player_name_en, number, position, grid, is_starter
              ) VALUES (
                ${id}, ${teamId}, ${coachName}, ${formation},
                ${p.id}, ${p.name}, ${p.number}, ${p.pos}, ${p.grid ?? null}, false
              )
            `
          }
        }
        processed++
      } catch (err) {
        errors.push({ id, error: err.message })
      }
    }

    return Response.json({ ok: true, processed, errors: errors.length > 0 ? errors : undefined })
  } catch (err) {
    console.error(err)
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
