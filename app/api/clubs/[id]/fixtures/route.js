import { auth } from '@clerk/nextjs/server'
import sql from '@/lib/db'

// GET /api/clubs/[id]/fixtures?year=YYYY
//   - 指定クラブ × 指定シーズンの終了済 試合一覧 (新しい順)
//   - 「初観戦試合」Select 用
//   - 認証必須 (profile-setup 用)
export async function GET(req, { params }) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const teamId = Number(id)
  if (!Number.isInteger(teamId) || teamId <= 0) {
    return Response.json({ error: 'Invalid team id' }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const year = Number(searchParams.get('year'))
  if (!Number.isInteger(year) || year < 1992 || year > 2030) {
    return Response.json({ error: 'Invalid year' }, { status: 400 })
  }

  const fixtures = await sql`
    SELECT
      f.id,
      f.date,
      f.round_number,
      f.league_id,
      f.home_score,
      f.away_score,
      (f.home_team_id = ${teamId}) AS is_home,
      CASE WHEN f.home_team_id = ${teamId} THEN at.name_ja ELSE ht.name_ja END AS opp_name_ja,
      CASE WHEN f.home_team_id = ${teamId} THEN at.short_name ELSE ht.short_name END AS opp_short,
      CASE WHEN f.home_team_id = ${teamId} THEN at.abbr ELSE ht.abbr END AS opp_abbr,
      f.venue_name_ja
    FROM fixtures f
    LEFT JOIN teams_master ht ON ht.id = f.home_team_id
    LEFT JOIN teams_master at ON at.id = f.away_team_id
    WHERE (f.home_team_id = ${teamId} OR f.away_team_id = ${teamId})
      AND f.season = ${year}
      AND f.finished_at IS NOT NULL
    ORDER BY f.date ASC
  `

  return Response.json({ fixtures })
}
