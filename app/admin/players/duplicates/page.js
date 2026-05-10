import sql from '@/lib/db'
import DuplicatesClient from './duplicates-client'

export const revalidate = 0

// ① 異体字組: normalize して同じだが name_ja が違う 2+ canonical
async function getKanjiVariants() {
  return await sql`
    WITH canonical_only AS (
      SELECT id, name_ja, team_id, is_active, dob, position
      FROM players_master
      WHERE canonical_id IS NULL OR canonical_id = id
    ),
    norm_kanji AS (
      SELECT id, name_ja, team_id, is_active, dob, position,
        lower(
          translate(
            replace(replace(replace(name_ja, ' ', ''), '　', ''), '・', ''),
            '眞髙﨑澤齋桒沢崎', '真高崎沢斉桑沢崎'
          )
        ) AS norm
      FROM canonical_only
      WHERE name_ja IS NOT NULL
    )
    SELECT
      norm,
      JSON_AGG(JSON_BUILD_OBJECT(
        'id', id, 'name_ja', name_ja, 'team_id', team_id,
        'is_active', is_active, 'dob', dob, 'position', position
      ) ORDER BY id) AS rows,
      BOOL_OR(is_active) AS any_active,
      COUNT(*)::int AS c
    FROM norm_kanji
    GROUP BY norm
    HAVING COUNT(DISTINCT name_ja) > 1
    ORDER BY any_active DESC, c DESC
  `.catch(() => [])
}

// ② 同一 name_ja で複数 canonical (active含む)
// 「全員 dob 違う」グループは別人確定なので除外、
// 「dob NULL を含む」or「dob 重複あり」グループのみ表示 (要レビュー)
async function getSameNameMultiCanonical() {
  return await sql`
    WITH canonical_only AS (
      SELECT id, name_ja, team_id, is_active, dob, position
      FROM players_master
      WHERE canonical_id IS NULL OR canonical_id = id
    ),
    grouped AS (
      SELECT
        name_ja,
        JSON_AGG(JSON_BUILD_OBJECT(
          'id', id, 'name_ja', name_ja, 'team_id', team_id,
          'is_active', is_active, 'dob', dob, 'position', position
        ) ORDER BY id) AS rows,
        BOOL_OR(is_active) AS any_active,
        COUNT(*)::int AS c,
        COUNT(*) FILTER (WHERE dob IS NULL)::int AS null_dob_count,
        COUNT(*)::int - COUNT(DISTINCT dob)::int AS dob_dup_signal,
        COUNT(DISTINCT dob)::int AS distinct_dobs
      FROM canonical_only
      WHERE name_ja IS NOT NULL
      GROUP BY name_ja
      HAVING COUNT(*) > 1 AND BOOL_OR(is_active) = true
    )
    SELECT name_ja, rows, any_active, c
    FROM grouped
    WHERE
      null_dob_count > 0          -- dob NULL を含む (判定不能)
      OR distinct_dobs < c         -- dob 重複あり (= 同一人物の疑い)
    ORDER BY c DESC, name_ja
  `.catch(() => [])
}

// ③ 1ID が同シーズンで複数チーム → in-season 移籍 OR 別人共有疑い
async function getOneIdMultipleTeams() {
  return await sql`
    SELECT
      COALESCE(pm.canonical_id, pm.id) AS canonical_id,
      pm.name_ja, pm.dob, pm.position,
      COUNT(DISTINCT fl.team_id)::int AS distinct_teams,
      ARRAY_AGG(DISTINCT fl.team_id) AS team_ids
    FROM fixture_lineups fl
    JOIN fixtures f ON f.id = fl.fixture_id
    JOIN players_master pm ON pm.id = fl.player_id
    WHERE f.season = 2026
    GROUP BY COALESCE(pm.canonical_id, pm.id), pm.name_ja, pm.dob, pm.position
    HAVING COUNT(DISTINCT fl.team_id) > 1
    ORDER BY distinct_teams DESC, canonical_id
  `.catch(() => [])
}

// 関連チームの情報を一括取得
async function getTeamsByIds(ids) {
  if (!ids || ids.length === 0) return []
  return await sql`
    SELECT id, name_ja, short_name, color_primary
    FROM teams_master WHERE id = ANY(${ids})
  `.catch(() => [])
}

export default async function DuplicatesPage() {
  const [kanjiVariants, sameNameMulti, oneIdMultiTeams] = await Promise.all([
    getKanjiVariants(),
    getSameNameMultiCanonical(),
    getOneIdMultipleTeams(),
  ])

  // 全チームID集めて情報取得
  const allTeamIds = new Set()
  for (const g of kanjiVariants) for (const r of (g.rows ?? [])) if (r.team_id) allTeamIds.add(r.team_id)
  for (const g of sameNameMulti) for (const r of (g.rows ?? [])) if (r.team_id) allTeamIds.add(r.team_id)
  for (const g of oneIdMultiTeams) for (const t of (g.team_ids ?? [])) if (t) allTeamIds.add(t)
  const teams = await getTeamsByIds([...allTeamIds])
  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))

  return (
    <div style={{ padding: '24px 16px', maxWidth: 1280, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 16 }}>
        重複・曖昧 整理
      </h1>
      <DuplicatesClient
        kanjiVariants={kanjiVariants}
        sameNameMulti={sameNameMulti}
        oneIdMultiTeams={oneIdMultiTeams}
        teamMap={teamMap}
      />
    </div>
  )
}
