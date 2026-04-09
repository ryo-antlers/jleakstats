import sql from '@/lib/db'

// 指定GWのfixture_player_statsが全てfantasy_pointsに登録されているか確認
export async function POST(request) {
  const { gameweek_id } = await request.json()

  const fixtures = await sql`
    SELECT f.id
    FROM fantasy_gameweek_fixtures fgf
    JOIN fixtures f ON f.id = fgf.fixture_id
    WHERE fgf.gameweek_id = ${gameweek_id}
      AND f.status IN ('FT', 'AET', 'PEN')
  `

  if (fixtures.length === 0) {
    return Response.json({ ok: false, error: '終了済み試合がありません' })
  }

  const fixtureIds = fixtures.map(f => f.id)

  // fantasy_pointsに未登録の選手を抽出
  const missing = await sql`
    SELECT fps.fixture_id, fps.player_id, fps.position, pm.name_ja, pm.name_en
    FROM fixture_player_stats fps
    LEFT JOIN players_master pm ON pm.id = fps.player_id
    WHERE fps.fixture_id = ANY(${fixtureIds})
      AND fps.position IN ('G', 'D', 'M', 'F')
      AND fps.minutes > 0
      AND NOT EXISTS (
        SELECT 1 FROM fantasy_points fp
        WHERE fp.gameweek_id = ${gameweek_id}
          AND fp.fixture_id = fps.fixture_id
          AND fp.player_id = COALESCE(pm.canonical_id, fps.player_id)
      )
    ORDER BY fps.fixture_id, fps.player_id
  `

  return Response.json({
    ok: true,
    fixtures: fixtures.length,
    missing: missing.length,
    players: missing,
  })
}
