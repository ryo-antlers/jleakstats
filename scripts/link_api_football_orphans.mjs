// API-Football のオーファン外部IDを canonical に紐付ける (Phase 8)
//
// 動作:
//   1. fixture_player_stats / fixture_lineups / fixture_events で使われている
//      API-Football ID のうち player_external_ids に未登録のものを抽出
//   2. チーム別にグループ化
//   3. 各チームの API-Football roster を取得 (dob 含む)
//   4. dob + team で canonical 検索 → 一致なら link
//   5. 失敗は pending_reviews に積む
//
// 実行: node --env-file=.env.local scripts/link_api_football_orphans.mjs
//        node --env-file=.env.local scripts/link_api_football_orphans.mjs --dry-run

import { neon } from '@neondatabase/serverless'
import { fetchPlayersByTeam, fetchPlayerById } from '../lib/api-football.js'

const sql = neon(process.env.DATABASE_URL)
const DRY_RUN = process.argv.includes('--dry-run')

console.error(`\n=== API-Football Orphan Linker ${DRY_RUN ? '(DRY-RUN)' : '(APPLY)'} ===`)

// ─── オーファン抽出 ───────────────────────────────
// fixture_* で使われている "API-Football ID 帯" (1〜8,999,999) のうち
// player_external_ids (source='api-football') に未登録のもの
// 9M+ は J公式スクレイパー由来のカスタムIDなので除外
const orphans = await sql`
  WITH all_player_refs AS (
    SELECT DISTINCT fps.player_id, fps.team_id, MAX(f.season) AS season
    FROM fixture_player_stats fps
    JOIN fixtures f ON f.id = fps.fixture_id
    WHERE f.season >= 2024
      AND fps.player_id IS NOT NULL
      AND fps.player_id BETWEEN 1 AND 8999999
    GROUP BY fps.player_id, fps.team_id
    UNION
    SELECT DISTINCT fl.player_id, fl.team_id, MAX(f.season)
    FROM fixture_lineups fl
    JOIN fixtures f ON f.id = fl.fixture_id
    WHERE f.season >= 2024
      AND fl.player_id IS NOT NULL
      AND fl.player_id BETWEEN 1 AND 8999999
    GROUP BY fl.player_id, fl.team_id
    UNION
    SELECT DISTINCT fe.player_id, fe.team_id, MAX(f.season)
    FROM fixture_events fe
    JOIN fixtures f ON f.id = fe.fixture_id
    WHERE f.season >= 2024
      AND fe.player_id IS NOT NULL
      AND fe.player_id BETWEEN 1 AND 8999999
    GROUP BY fe.player_id, fe.team_id
  )
  SELECT apr.player_id, apr.team_id, MAX(apr.season) AS season
  FROM all_player_refs apr
  -- teams_master に存在するチーム (J1+百年構想) のみ対象
  WHERE EXISTS (SELECT 1 FROM teams_master tm WHERE tm.id = apr.team_id)
    AND NOT EXISTS (
      SELECT 1 FROM player_external_ids
      WHERE source='api-football' AND external_id = apr.player_id::text
    )
  GROUP BY apr.player_id, apr.team_id
  ORDER BY apr.team_id, apr.player_id
`
console.error(`オーファン (= API-Football ID で未紐付け) : ${orphans.length}件`)

if (orphans.length === 0) {
  console.error('オーファンなし。終了。')
  process.exit(0)
}

// チーム別にグループ化
const byTeam = new Map()
for (const r of orphans) {
  if (!byTeam.has(r.team_id)) byTeam.set(r.team_id, new Set())
  byTeam.get(r.team_id).add(r.player_id)
}
console.error(`対象チーム数: ${byTeam.size}`)

// ─── DB 状態ロード (canonical 検索用) ──────────────
const pmRows = await sql`SELECT id, name_ja, dob, team_id, canonical_id FROM players_master`
const playerById = new Map(pmRows.map(r => [r.id, r]))
const dobToJst = d => d ? new Date(d.getTime() + 9*3600*1000).toISOString().slice(0,10) : null

// dob+team → canonical id のマップを構築 (高速ルックアップ用)
// canonical のみ (canonical_id IS NULL or = id)
const canonicalByDobTeam = new Map() // `${dob}|${teamId}` → [canonical_id]
for (const r of pmRows) {
  if (r.canonical_id != null && r.canonical_id !== r.id) continue  // alias は除外
  if (!r.dob || !r.team_id) continue
  const key = `${dobToJst(r.dob)}|${r.team_id}`
  if (!canonicalByDobTeam.has(key)) canonicalByDobTeam.set(key, [])
  canonicalByDobTeam.get(key).push(r.id)
}

// dob のみのマップも (移籍してきた選手の検出用)
const canonicalByDob = new Map()  // dob → [canonical_id]
for (const r of pmRows) {
  if (r.canonical_id != null && r.canonical_id !== r.id) continue
  if (!r.dob) continue
  const key = dobToJst(r.dob)
  if (!canonicalByDob.has(key)) canonicalByDob.set(key, [])
  canonicalByDob.get(key).push(r.id)
}

// ─── 各チームの roster 取得 → マッチング ────────────
const newLinks = []  // { canonical_id, api_football_id, name }
const pendings = []  // pending_reviews 用

for (const [teamId, ids] of byTeam) {
  console.error(`\nチーム ${teamId}: ${ids.size}件のオーファン`)
  let roster
  try {
    roster = await fetchPlayersByTeam(teamId, 2026, 1)
  } catch (e) {
    console.error(`  ✗ API-Football fetch 失敗: ${e.message}`)
    // fetch失敗時は pending に積む
    for (const id of ids) {
      pendings.push({
        source: 'api-football',
        external_id: String(id),
        observed_name: null,
        observed_team_id: teamId,
        observed_dob: null,
        candidate_canonicals: null,
        reason: `fetch_failed: ${e.message.slice(0, 100)}`,
      })
    }
    continue
  }

  // roster で見つかった orphan を track (見つからない分は後で pending)
  const foundIds = new Set()

  for (const entry of roster ?? []) {
    const p = entry.player
    if (!p?.id || !ids.has(p.id)) continue
    foundIds.add(p.id)

    const dob = p.birth?.date ?? null
    const lastName = p.lastname ?? null

    if (!dob) {
      pendings.push({
        source: 'api-football',
        external_id: String(p.id),
        observed_name: p.name,
        observed_team_id: teamId,
        observed_dob: null,
        candidate_canonicals: null,
        reason: 'no_dob',
      })
      continue
    }

    // dob + team で canonical 検索
    const dobTeamKey = `${dob}|${teamId}`
    let candidates = canonicalByDobTeam.get(dobTeamKey) ?? []

    // dob ±1日 (JST/UTC ズレ対策) も試す
    if (candidates.length === 0) {
      const dt = new Date(dob).getTime()
      const dobMinus1 = new Date(dt - 86400000).toISOString().slice(0,10)
      const dobPlus1  = new Date(dt + 86400000).toISOString().slice(0,10)
      candidates = [
        ...(canonicalByDobTeam.get(`${dobMinus1}|${teamId}`) ?? []),
        ...(canonicalByDobTeam.get(`${dobPlus1}|${teamId}`) ?? []),
      ]
    }

    if (candidates.length === 1) {
      newLinks.push({ canonical_id: candidates[0], api_football_id: p.id, name: p.name, dob, team: teamId })
      continue
    }

    // dob のみ (移籍してきた選手) で検索
    const allDobMatches = canonicalByDob.get(dob) ?? []
    if (allDobMatches.length === 1) {
      newLinks.push({ canonical_id: allDobMatches[0], api_football_id: p.id, name: p.name, dob, team: teamId, note: 'transferred' })
      continue
    }

    // 失敗 → pending_review
    pendings.push({
      source: 'api-football',
      external_id: String(p.id),
      observed_name: p.name,
      observed_team_id: teamId,
      observed_dob: dob,
      candidate_canonicals: candidates.length > 0 ? candidates : (allDobMatches.length > 0 ? allDobMatches : null),
      reason: candidates.length === 0 && allDobMatches.length === 0
        ? 'no_match'
        : `ambiguous (${candidates.length || allDobMatches.length}候補)`,
    })
  }

  // roster に居なかった orphan は個別取得 (/players?id=X) で詳細を入手
  for (const id of ids) {
    if (foundIds.has(id)) continue
    let observedName = null
    let observedDob = null
    try {
      const detail = await fetchPlayerById(id, 2026)
      const p = detail?.[0]?.player
      if (p) {
        observedName = p.name
        observedDob = p.birth?.date ?? null

        // dob が取れた場合はマッチング再試行
        if (observedDob) {
          const dobTeamKey = `${observedDob}|${teamId}`
          let candidates = canonicalByDobTeam.get(dobTeamKey) ?? []
          if (candidates.length === 0) {
            const dt = new Date(observedDob).getTime()
            candidates = [
              ...(canonicalByDobTeam.get(`${new Date(dt - 86400000).toISOString().slice(0,10)}|${teamId}`) ?? []),
              ...(canonicalByDobTeam.get(`${new Date(dt + 86400000).toISOString().slice(0,10)}|${teamId}`) ?? []),
            ]
          }
          if (candidates.length === 1) {
            newLinks.push({ canonical_id: candidates[0], api_football_id: id, name: observedName, dob: observedDob, team: teamId, note: 'individual_fetch' })
            continue  // pending に積まずに次へ
          }
          // dob のみで再検索
          const allDobMatches = canonicalByDob.get(observedDob) ?? []
          if (allDobMatches.length === 1) {
            newLinks.push({ canonical_id: allDobMatches[0], api_football_id: id, name: observedName, dob: observedDob, team: teamId, note: 'individual_fetch_transferred' })
            continue
          }
        }
      }
    } catch (e) {
      console.error(`  ✗ /players?id=${id} 取得失敗: ${e.message.slice(0, 80)}`)
    }

    pendings.push({
      source: 'api-football',
      external_id: String(id),
      observed_name: observedName,
      observed_team_id: teamId,
      observed_dob: observedDob,
      candidate_canonicals: null,
      reason: observedDob ? 'no_match_with_dob' : 'no_dob',
    })
  }
}

console.error(`\n=== マッチング結果 ===`)
console.error(`  自動link: ${newLinks.length}件`)
console.error(`  pending: ${pendings.length}件`)

if (DRY_RUN) {
  console.log(JSON.stringify({
    summary: { orphans: orphans.length, auto_linked: newLinks.length, pending: pendings.length },
    new_links: newLinks.slice(0, 20),
    pendings: pendings.slice(0, 20),
  }, null, 2))
  process.exit(0)
}

// ─── APPLY ────────────────────────────────────────
const queries = []

for (const l of newLinks) {
  queries.push(sql`
    INSERT INTO player_external_ids (canonical_id, source, external_id)
    VALUES (${l.canonical_id}, 'api-football', ${String(l.api_football_id)})
    ON CONFLICT (source, external_id) DO NOTHING
  `)
}

for (const p of pendings) {
  queries.push(sql`
    INSERT INTO pending_reviews (source, external_id, observed_name, observed_team_id, observed_dob, candidate_canonicals, reason)
    VALUES (${p.source}, ${p.external_id}, ${p.observed_name}, ${p.observed_team_id}, ${p.observed_dob}, ${p.candidate_canonicals}, ${p.reason})
    ON CONFLICT (source, external_id) DO UPDATE SET
      observed_name = EXCLUDED.observed_name,
      observed_team_id = EXCLUDED.observed_team_id,
      observed_dob = EXCLUDED.observed_dob,
      candidate_canonicals = EXCLUDED.candidate_canonicals,
      reason = EXCLUDED.reason
  `)
}

const summary = {
  ran_at: new Date().toISOString(),
  orphans: orphans.length,
  auto_linked: newLinks.length,
  pending: pendings.length,
}

queries.push(sql`
  INSERT INTO canonical_audit_log (action, payload, actor)
  VALUES ('phase8_orphan_link', ${JSON.stringify(summary)}::jsonb, 'cron')
`)

if (queries.length > 0) {
  await sql.transaction(queries)
  console.error(`  ✓ COMMIT 成功 (${queries.length} queries)`)
}

console.log(JSON.stringify({ summary, new_links: newLinks, pendings }, null, 2))
