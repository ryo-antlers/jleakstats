import sql from '@/lib/db'

// 次節の対戦相手を team_id -> { abbr, color, home } で返す
export async function GET() {
  const [nextGw] = await sql`
    SELECT id FROM fantasy_gameweeks
    WHERE status IN ('upcoming', 'active')
    ORDER BY gw_number ASC
    LIMIT 1
  `

  if (!nextGw) return Response.json({ opponents: {} })

  const fixtures = await sql`
    SELECT
      f.home_team_id,
      f.away_team_id,
      ht.abbr AS home_abbr,
      ht.color_primary AS home_color,
      at.abbr AS away_abbr,
      at.color_primary AS away_color
    FROM fantasy_gameweek_fixtures fgf
    JOIN fixtures f ON f.id = fgf.fixture_id
    LEFT JOIN teams_master ht ON ht.id = f.home_team_id
    LEFT JOIN teams_master at ON at.id = f.away_team_id
    WHERE fgf.gameweek_id = ${nextGw.id}
  `

  const opponents = {}
  for (const f of fixtures) {
    if (f.home_team_id) opponents[f.home_team_id] = { abbr: f.away_abbr, color: f.away_color, home: true }
    if (f.away_team_id) opponents[f.away_team_id] = { abbr: f.home_abbr, color: f.home_color, home: false }
  }

  return Response.json({ opponents }, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' },
  })
}
