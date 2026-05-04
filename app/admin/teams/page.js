import sql from '@/lib/db'
import TeamsEditor from './teams-editor'

export const revalidate = 0  // 常に最新

async function getAllTeams() {
  // 試合に出てくるチームだけに絞る (たまに残ってる古いマスター除外)
  return await sql`
    SELECT t.id, t.name_ja, t.name_en, t.short_name, t.abbr,
           t.color_primary, t.color_secondary, t.group_name, t.category,
           (
             SELECT COUNT(*) FROM fixtures f
             WHERE f.season = 2026 AND (f.home_team_id = t.id OR f.away_team_id = t.id)
           ) AS fixtures_2026,
           (
             SELECT MIN(f.league_id) FROM fixtures f
             WHERE f.season = 2026 AND (f.home_team_id = t.id OR f.away_team_id = t.id)
           ) AS league_id_2026
    FROM teams_master t
    ORDER BY t.id ASC
  `.catch(() => [])
}

export default async function AdminTeamsPage() {
  const teams = await getAllTeams()
  return (
    <div style={{ padding: '24px 16px', maxWidth: 1280, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '0.05em', marginBottom: 8 }}>
        チーム設定
      </h1>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 24 }}>
        クラブカラー・略称・短縮名の編集。プレビューしながら調整できます。
      </p>
      <TeamsEditor teams={teams} />
    </div>
  )
}
