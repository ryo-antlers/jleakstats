import { auth } from '@clerk/nextjs/server'
import sql from '@/lib/db'
import RatingsView from './ratings-view'

// サーバーコンポーネント: 採点セクションのデータを集めて RatingsView に渡す
export default async function RatingsSection({ fixtureId }) {
  const { userId } = await auth()

  const [fixtureRows, lineups, aggregated] = await Promise.all([
    sql`
      SELECT
        id,
        finished_at,
        (finished_at IS NOT NULL
         AND finished_at + INTERVAL '48 hours' > NOW()) AS ratable,
        (finished_at IS NOT NULL
         AND finished_at + INTERVAL '48 hours' <= NOW()) AS closed,
        (finished_at + INTERVAL '48 hours') AS deadline_at
      FROM fixtures
      WHERE id = ${fixtureId}
    `,
    sql`
      SELECT
        fl.player_id,
        fl.team_id,
        fl.player_name_en,
        fl.number,
        fl.position,
        fl.is_starter,
        pm.name_ja,
        t.name_ja      AS team_name_ja,
        t.color_primary AS team_color,
        COALESCE(fps.minutes, 0) AS minutes_played
      FROM fixture_lineups fl
      LEFT JOIN players_master pm ON pm.id = fl.player_id
      LEFT JOIN teams_master t   ON t.id  = fl.team_id
      LEFT JOIN fixture_player_stats fps
        ON fps.fixture_id = fl.fixture_id
       AND fps.player_id  = fl.player_id
      WHERE fl.fixture_id = ${fixtureId}
        AND (fl.is_starter = true OR COALESCE(fps.minutes, 0) > 0)
      ORDER BY fl.team_id ASC, fl.is_starter DESC, fl.number ASC NULLS LAST
    `,
    sql`
      SELECT
        player_id,
        ROUND(AVG(score)::numeric, 1) AS avg_score,
        COUNT(*) FILTER (WHERE NOT skipped) AS rate_count,
        COUNT(*) FILTER (WHERE skipped)     AS skip_count
      FROM ratings
      WHERE fixture_id = ${fixtureId}
      GROUP BY player_id
    `,
  ])

  const fixture = fixtureRows[0] ?? null

  let profile = null
  let myRatings = []
  if (userId) {
    const profiles = await sql`
      SELECT
        up.clerk_user_id,
        up.display_name,
        up.supported_club_id,
        t.name_ja      AS club_name_ja,
        t.color_primary AS club_color
      FROM user_profiles up
      LEFT JOIN teams_master t ON t.id = up.supported_club_id
      WHERE up.clerk_user_id = ${userId}
    `
    profile = profiles[0] ?? null

    if (profile) {
      myRatings = await sql`
        SELECT player_id, score, skipped
        FROM ratings
        WHERE clerk_user_id = ${userId}
          AND fixture_id = ${fixtureId}
      `
    }
  }

  return (
    <RatingsView
      fixtureId={fixtureId}
      fixture={fixture}
      lineups={lineups}
      aggregated={aggregated}
      userId={userId}
      profile={profile}
      myRatings={myRatings}
    />
  )
}
