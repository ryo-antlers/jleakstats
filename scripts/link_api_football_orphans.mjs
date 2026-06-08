// API-Football のオーファン外部IDを canonical に紐付ける (Phase 8)
//
// 動作:
//   1. fixture_player_stats / fixture_lineups / fixture_events で使われている
//      API-Football ID のうち player_external_ids に未登録のものを抽出
//      (各 orphan の観測シーズン = MAX(season) も取得)
//   2. 各 orphan を /players?id=X で個別取得。観測シーズン優先で複数シーズンを
//      試し、dob が取れたら確定 (2024〜2025在籍→2026離脱の選手の取りこぼし防止)
//   3. dob + team で canonical 検索 → 一致なら link
//   4. 失敗は pending_reviews に積む (reason: not_in_api / no_dob / no_match / ambiguous)
//
// 実行: node --env-file=.env.local scripts/link_api_football_orphans.mjs
//        node --env-file=.env.local scripts/link_api_football_orphans.mjs --dry-run

import { neon } from '@neondatabase/serverless'
import { fetchPlayerById, sleep } from '../lib/api-football.js'
import { SEASON } from '../lib/season.js'

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
    -- admin で skip 済みのものは再検出しない (毎週レポートに再浮上させない)
    AND NOT EXISTS (
      SELECT 1 FROM pending_reviews pr
      WHERE pr.source='api-football' AND pr.external_id = apr.player_id::text
        AND pr.status='skipped'
    )
  GROUP BY apr.player_id, apr.team_id
  ORDER BY apr.team_id, apr.player_id
`
console.error(`オーファン (= API-Football ID で未紐付け) : ${orphans.length}件`)

if (orphans.length === 0) {
  console.error('オーファンなし。終了。')
  process.exit(0)
}

// チーム別にグループ化 (playerId → 観測シーズン)
const byTeam = new Map()
for (const r of orphans) {
  if (!byTeam.has(r.team_id)) byTeam.set(r.team_id, new Map())
  byTeam.get(r.team_id).set(r.player_id, r.season)
}
console.error(`対象チーム数: ${byTeam.size}`)

// fixture データから選手名を回収 (API-Football に居ない選手も admin で実名表示できるように)
const orphanIds = orphans.map(o => o.player_id)
const nameRows = await sql`
  SELECT player_id, MAX(player_name_ja) AS ja, MAX(player_name_en) AS en FROM (
    SELECT player_id, player_name_ja, player_name_en FROM fixture_lineups WHERE player_id = ANY(${orphanIds})
    UNION ALL
    SELECT player_id, player_name_ja, player_name_en FROM fixture_events WHERE player_id = ANY(${orphanIds})
  ) t GROUP BY player_id`
const nameByPlayer = new Map()
for (const r of nameRows) nameByPlayer.set(r.player_id, r.ja || r.en || null)

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

// ─── 各 orphan を個別取得 → マッチング ───────────────
// dob+team で canonical 検索するヘルパー (±1日のズレも吸収)
function matchByDob(dob, teamId) {
  let candidates = canonicalByDobTeam.get(`${dob}|${teamId}`) ?? []
  if (candidates.length === 0) {
    const dt = new Date(dob).getTime()
    candidates = [
      ...(canonicalByDobTeam.get(`${new Date(dt - 86400000).toISOString().slice(0,10)}|${teamId}`) ?? []),
      ...(canonicalByDobTeam.get(`${new Date(dt + 86400000).toISOString().slice(0,10)}|${teamId}`) ?? []),
    ]
  }
  return candidates
}

// 観測シーズンを先頭に、過去シーズンへフォールバックして dob を探す
// (前々シーズン在籍→今季離脱の選手は当季 season では空で返るため、過去2季も試す)
const FALLBACK_SEASONS = [SEASON, SEASON - 1, SEASON - 2]

const newLinks = []  // { canonical_id, api_football_id, name }
const pendings = []  // pending_reviews 用

for (const [teamId, idSeasonMap] of byTeam) {
  console.error(`\nチーム ${teamId}: ${idSeasonMap.size}件のオーファン`)

  for (const [id, observedSeason] of idSeasonMap) {
    const seasons = [...new Set([observedSeason, ...FALLBACK_SEASONS].filter(Boolean))]

    // dob が取れるまでシーズンを試す。レコードはあるが dob 無しの場合は名前だけ保持
    let record = null
    let recordSeason = null
    for (const s of seasons) {
      let p
      try {
        p = (await fetchPlayerById(id, s))?.[0]?.player
      } catch (e) {
        console.error(`  ✗ /players?id=${id}&season=${s}: ${e.message.slice(0, 80)}`)
        await sleep(300)
        continue
      }
      if (p) {
        record = p
        recordSeason = s
        if (p.birth?.date) break  // dob が取れたら確定
      }
      await sleep(150)
    }

    // 名前は API レコード優先、無ければ fixture データから回収
    const observedName = record?.name ?? nameByPlayer.get(id) ?? null
    const dob = record?.birth?.date ?? null

    // どのシーズンでも API に存在しない = 真に紐付け不能 (名前は fixture から復元)
    if (!record) {
      pendings.push({ source: 'api-football', external_id: String(id), observed_name: observedName,
        observed_team_id: teamId, observed_dob: null, candidate_canonicals: null, reason: 'not_in_api' })
      continue
    }
    // レコードはあるが dob が全シーズンで無い = 手動入力必要
    if (!dob) {
      pendings.push({ source: 'api-football', external_id: String(id), observed_name: observedName,
        observed_team_id: teamId, observed_dob: null, candidate_canonicals: null, reason: 'no_dob' })
      continue
    }

    // dob + team
    const candidates = matchByDob(dob, teamId)
    if (candidates.length === 1) {
      newLinks.push({ canonical_id: candidates[0], api_football_id: id, name: observedName, dob, team: teamId, season: recordSeason })
      continue
    }
    // dob のみ (移籍してきた選手)
    const allDobMatches = canonicalByDob.get(dob) ?? []
    if (allDobMatches.length === 1) {
      newLinks.push({ canonical_id: allDobMatches[0], api_football_id: id, name: observedName, dob, team: teamId, season: recordSeason, note: 'transferred' })
      continue
    }

    pendings.push({
      source: 'api-football', external_id: String(id), observed_name: observedName,
      observed_team_id: teamId, observed_dob: dob,
      candidate_canonicals: candidates.length > 0 ? candidates : (allDobMatches.length > 0 ? allDobMatches : null),
      reason: candidates.length === 0 && allDobMatches.length === 0
        ? 'no_match'
        : `ambiguous (${candidates.length || allDobMatches.length}候補)`,
    })
  }
}

// pending の理由別内訳 (ambiguous は候補数を畳んで集計)
const reasonCounts = {}
for (const p of pendings) {
  const key = p.reason.startsWith('ambiguous') ? 'ambiguous' : p.reason
  reasonCounts[key] = (reasonCounts[key] ?? 0) + 1
}

console.error(`\n=== マッチング結果 ===`)
console.error(`  自動link: ${newLinks.length}件`)
console.error(`  pending: ${pendings.length}件`)
console.error(`  pending 内訳: ${JSON.stringify(reasonCounts)}`)

if (DRY_RUN) {
  console.log(JSON.stringify({
    summary: { orphans: orphans.length, auto_linked: newLinks.length, pending: pendings.length, pending_by_reason: reasonCounts },
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
  // 自動 link できたものは、過去の pending 行 (旧バージョンが no_dob 等で積んだもの) を閉じる
  queries.push(sql`
    UPDATE pending_reviews
    SET status = 'resolved', resolved_canonical_id = ${l.canonical_id}, resolved_by = 'cron', resolved_at = NOW()
    WHERE source = 'api-football' AND external_id = ${String(l.api_football_id)} AND status = 'pending'
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
  pending_by_reason: reasonCounts,
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
