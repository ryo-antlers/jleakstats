import sql from '@/lib/db'
import { fetchFixtures } from '@/lib/api-football'

export async function GET() {
  try {
    const response = await fetchFixtures()

    let upserted = 0

    for (const item of response) {
      const f = item.fixture
      const teams = item.teams
      const goals = item.goals
      const score = item.score
      const league = item.league

      // "Regular Season - 8" → 8
      const roundMatch = league.round?.match(/Regular Season - (\d+)/)
      const roundNumber = roundMatch ? parseInt(roundMatch[1]) : null

      const winner = teams.home.winner === true ? 'home'
        : teams.away.winner === true ? 'away'
        : teams.home.winner === false && teams.away.winner === false ? 'draw'
        : null

      await sql`
        INSERT INTO fixtures (
          id, league_id, season, round, round_number, date,
          referee_en, venue_id,
          home_team_id, away_team_id,
          home_score, away_score,
          home_score_ht, away_score_ht,
          home_penalty, away_penalty,
          status, elapsed, winner,
          updated_at
        ) VALUES (
          ${f.id}, 98, 2026,
          ${league.round}, ${roundNumber},
          ${f.date},
          ${f.referee ?? null},
          ${item.venue?.id ?? null},
          ${teams.home.id}, ${teams.away.id},
          ${goals.home}, ${goals.away},
          ${score.halftime?.home ?? null}, ${score.halftime?.away ?? null},
          ${score.penalty?.home ?? null}, ${score.penalty?.away ?? null},
          ${f.status.short}, ${f.status.elapsed ?? null},
          ${winner},
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          home_score     = EXCLUDED.home_score,
          away_score     = EXCLUDED.away_score,
          home_score_ht  = EXCLUDED.home_score_ht,
          away_score_ht  = EXCLUDED.away_score_ht,
          home_penalty   = EXCLUDED.home_penalty,
          away_penalty   = EXCLUDED.away_penalty,
          status         = EXCLUDED.status,
          elapsed        = EXCLUDED.elapsed,
          winner         = EXCLUDED.winner,
          referee_en     = EXCLUDED.referee_en,
          updated_at     = NOW()
      `
      upserted++
    }

    return Response.json({ ok: true, upserted })
  } catch (err) {
    console.error(err)
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
