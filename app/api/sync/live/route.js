import sql from '@/lib/db'
import { fetchLiveFixtures, fetchFixturesByIds, API_LEAGUES_ALL } from '@/lib/api-football'

// API-Football の LIVE 状態 (試合中) ステータスコード
const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE']

// 進行中の試合のスコア・status のみ高頻度で同期する軽量エンドポイント
// /api/sync/fixtures より絞った専用版 (live=all で進行中の試合のみAPIから返る)
// 1分cron想定 (cron-job.org) → 試合中以外は0件で即終了するのでAPI消費は控えめ
// J1 + J2/J3百年構想 の両方を 1コール/リーグ で取得
export async function GET(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const responses = await Promise.all(
      API_LEAGUES_ALL.map(league =>
        fetchLiveFixtures(league).then(r => ({ league, items: r ?? [] }))
      )
    )

    const allItems = responses.flatMap(r => r.items)
    if (allItems.length === 0) {
      return Response.json({
        ok: true,
        live: 0,
        updated: 0,
        by_league: Object.fromEntries(responses.map(r => [r.league, 0])),
      })
    }

    let updated = 0
    const errors = []

    for (const item of allItems) {
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

    // --- 終了したばかりの試合を検出して LIVE → FT/AET/PEN に切り替える ---
    // DB で LIVE 扱いだが今回の live レスポンスに含まれていない fixture =
    // たった今終了した試合 (API-Football は終了直後に live レスポンスから外す)
    const liveIdsInResponse = new Set(allItems.map(i => Number(i.fixture.id)))
    const stillLiveInDB = await sql`
      SELECT id FROM fixtures WHERE status = ANY(${LIVE_STATUSES})
    `.catch(() => [])
    const missingIds = stillLiveInDB
      .map(r => Number(r.id))
      .filter(id => !liveIdsInResponse.has(id))

    let finalized = 0
    if (missingIds.length > 0) {
      try {
        const finished = await fetchFixturesByIds(missingIds)
        for (const item of finished ?? []) {
          const f = item.fixture
          const goals = item.goals
          const score = item.score
          const teams = item.teams
          const winner = teams.home.winner === true ? 'home'
            : teams.away.winner === true ? 'away'
            : teams.home.winner === false && teams.away.winner === false ? 'draw'
            : null
          // 終了ステータス (FT/AET/PEN) ならスコアと共に更新
          if (['FT', 'AET', 'PEN'].includes(f.status.short)) {
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
                finished_at   = COALESCE(finished_at, NOW()),
                updated_at    = NOW()
              WHERE id = ${f.id}
            `
            finalized++
          }
        }
      } catch (err) {
        errors.push({ stage: 'finalize', error: err.message })
      }
    }

    return Response.json({
      ok: true,
      live: allItems.length,
      updated,
      finalized,
      by_league: Object.fromEntries(responses.map(r => [r.league, r.items.length])),
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
