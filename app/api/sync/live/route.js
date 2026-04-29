import sql from '@/lib/db'
import { fetchLiveFixtures } from '@/lib/api-football'

// 進行中の試合のスコア・status のみ高頻度で同期する軽量エンドポイント
// /api/sync/fixtures より絞った専用版 (--live=all で進行中の試合のみAPIから返る)
// 5分cron想定 → 試合中以外は0件で即終了するのでAPI消費は控えめ
export async function GET(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const response = await fetchLiveFixtures()

    if (!response || response.length === 0) {
      return Response.json({ ok: true, live: 0, updated: 0 })
    }

    let updated = 0
    const errors = []

    for (const item of response) {
      const f = item.fixture
      const goals = item.goals
      const score = item.score
      const teams = item.teams

      const winner = teams.home.winner === true ? 'home'
        : teams.away.winner === true ? 'away'
        : teams.home.winner === false && teams.away.winner === false ? 'draw'
        : null

      try {
        await sql`
          UPDATE fixtures SET
            home_score    = ${goals.home},
            away_score    = ${goals.away},
            home_score_ht = ${score.halftime?.home ?? null},
            away_score_ht = ${score.halftime?.away ?? null},
            home_penalty  = ${score.penalty?.home ?? null},
            away_penalty  = ${score.penalty?.away ?? null},
            status        = ${f.status.short},
            elapsed       = ${f.status.elapsed ?? null},
            winner        = ${winner},
            updated_at    = NOW()
          WHERE id = ${f.id}
        `
        updated++
      } catch (err) {
        errors.push({ fixture_id: f.id, error: err.message })
      }
    }

    return Response.json({
      ok: true,
      live: response.length,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
