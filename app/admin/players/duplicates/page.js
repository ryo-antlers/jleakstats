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

// ③ 1canonical が複数チームの fixture 記録 → in-season 移籍 OR 別人共有疑い
//    breakdown を per (raw_player_id, team_id) で取って reassign の対象候補にする
async function getOneIdMultipleTeams() {
  // canonicals that have fixture records at multiple teams in season >= 2024
  const targetCanonicals = await sql`
    SELECT DISTINCT COALESCE(pm.canonical_id, pm.id) AS canonical_id
    FROM fixture_lineups fl
    JOIN fixtures f ON f.id = fl.fixture_id
    JOIN players_master pm ON pm.id = fl.player_id
    WHERE f.season >= 2024
    GROUP BY COALESCE(pm.canonical_id, pm.id)
    HAVING COUNT(DISTINCT fl.team_id) > 1
  `.catch(() => [])

  if (targetCanonicals.length === 0) return []
  const ids = targetCanonicals.map(r => r.canonical_id)

  // breakdown
  const breakdowns = await sql`
    SELECT
      COALESCE(pm.canonical_id, pm.id) AS canonical_id,
      pm.name_ja AS canonical_name,
      cpm.team_id AS canonical_team_id,
      fl.player_id AS source_player_id,
      fl.team_id,
      COUNT(*)::int AS apps,
      ARRAY_AGG(DISTINCT f.season ORDER BY f.season) AS seasons,
      MIN(f.date)::date AS first_match,
      MAX(f.date)::date AS last_match
    FROM fixture_lineups fl
    JOIN fixtures f ON f.id = fl.fixture_id
    JOIN players_master pm ON pm.id = fl.player_id
    LEFT JOIN players_master cpm ON cpm.id = COALESCE(pm.canonical_id, pm.id)
    WHERE f.season >= 2024
      AND COALESCE(pm.canonical_id, pm.id) = ANY(${ids})
    GROUP BY canonical_id, pm.name_ja, cpm.team_id, fl.player_id, fl.team_id
    ORDER BY canonical_id, source_player_id, fl.team_id
  `.catch(() => [])

  // group by canonical
  const byCanonical = new Map()
  for (const r of breakdowns) {
    if (!byCanonical.has(r.canonical_id)) {
      byCanonical.set(r.canonical_id, {
        canonical_id: r.canonical_id,
        name_ja: r.canonical_name,
        canonical_team_id: r.canonical_team_id,
        records: [],
      })
    }
    byCanonical.get(r.canonical_id).records.push({
      source_player_id: r.source_player_id,
      team_id: r.team_id,
      apps: r.apps,
      seasons: r.seasons,
      first_match: r.first_match,
      last_match: r.last_match,
    })
  }
  return [...byCanonical.values()]
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
  for (const c of oneIdMultiTeams) {
    if (c.canonical_team_id) allTeamIds.add(c.canonical_team_id)
    for (const r of (c.records ?? [])) if (r.team_id) allTeamIds.add(r.team_id)
  }
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
