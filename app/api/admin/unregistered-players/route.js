import sql from '@/lib/db'

// 2026シーズンJ1の試合のみを対象に未登録選手を検出
export async function GET() {
  // fixture_player_stats: player_idがplayers_masterにない
  const fromStats = await sql`
    SELECT DISTINCT fps.player_id, null AS player_name_en, fps.team_id, tm.name_ja AS team_name, 'stats' AS source
    FROM fixture_player_stats fps
    JOIN fixtures f ON f.id = fps.fixture_id
    LEFT JOIN teams_master tm ON tm.id = fps.team_id
    WHERE f.season = 2026 AND f.league_id = 98
      AND NOT EXISTS (
        SELECT 1 FROM players_master pm WHERE pm.id = fps.player_id
      )
  `

  // fixture_lineups: player_idがplayers_masterにない（IDなしは除外）
  const fromLineups = await sql`
    SELECT DISTINCT fl.player_id, fl.player_name_en, fl.team_id, tm.name_ja AS team_name, 'lineup' AS source
    FROM fixture_lineups fl
    JOIN fixtures f ON f.id = fl.fixture_id
    LEFT JOIN teams_master tm ON tm.id = fl.team_id
    WHERE f.season = 2026 AND f.league_id = 98
      AND fl.player_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM players_master pm WHERE pm.id = fl.player_id
      )
  `

  return Response.json({ players: [...fromStats, ...fromLineups] })
}
