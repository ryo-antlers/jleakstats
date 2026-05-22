// 海外リーグでプレーする日本人選手を API-Football から発見し、
// players_master の canonical_id へ紐付けて player_overseas_status を埋める。
//
// マッチング戦略:
//   1) dob (生年月日) 完全一致を必須条件
//   2) 同じ dob で複数候補が出た場合は name_en で絞り込み
//
// 実行 (dry-run):
//   node --env-file=.env.local scripts/discover_japanese_overseas.mjs
// 適用 (DB 書き込み):
//   node --env-file=.env.local scripts/discover_japanese_overseas.mjs --apply
// シーズン指定 (デフォルト 2025):
//   node --env-file=.env.local scripts/discover_japanese_overseas.mjs --season 2024 --apply
//
// API-Football Pro plan (7,500/day) 前提。
// 目安: 主要 ~25 リーグ × 平均 20 チーム = 500 team-squads fetch + 25 team-list
//      ≒ 525 call、300ms スリープで wall-clock 約 3 分。

import { Pool } from '@neondatabase/serverless'
import {
  fetchTeamsByLeague,
  fetchPlayersByTeam,
  sleep,
} from '../lib/api-football.js'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const SEASON =
  Number(args[args.indexOf('--season') + 1]) ||
  // 欧州 25-26 シーズン (2026/5 時点ではほぼ終了)。MLS / 北欧は同年カレンダー
  2025

// 対象リーグ。API-Football の league_id を直書き。
// 日本人選手が居る・居る可能性のあるリーグを優先。
const TARGET_LEAGUES = [
  { id: 39,  name: 'Premier League',      country: 'England' },
  { id: 40,  name: 'Championship',        country: 'England' },
  { id: 140, name: 'La Liga',             country: 'Spain' },
  { id: 141, name: 'Segunda División',    country: 'Spain' },
  { id: 135, name: 'Serie A',             country: 'Italy' },
  { id: 136, name: 'Serie B',             country: 'Italy' },
  { id: 78,  name: 'Bundesliga',          country: 'Germany' },
  { id: 79,  name: '2. Bundesliga',       country: 'Germany' },
  { id: 61,  name: 'Ligue 1',             country: 'France' },
  { id: 62,  name: 'Ligue 2',             country: 'France' },
  { id: 88,  name: 'Eredivisie',          country: 'Netherlands' },
  { id: 94,  name: 'Primeira Liga',       country: 'Portugal' },
  { id: 144, name: 'Jupiler Pro League',  country: 'Belgium' },
  { id: 179, name: 'Premiership',         country: 'Scotland' },
  { id: 203, name: 'Süper Lig',           country: 'Turkey' },
  { id: 253, name: 'Major League Soccer', country: 'USA' },
  { id: 307, name: 'Pro League',          country: 'Saudi Arabia' },
  { id: 292, name: 'K League 1',          country: 'South Korea' },
  { id: 293, name: 'K League 2',          country: 'South Korea' },
  { id: 207, name: 'Super League',        country: 'Switzerland' },
  { id: 218, name: 'Bundesliga (AUT)',    country: 'Austria' },
  { id: 119, name: 'Superliga',           country: 'Denmark' },
  { id: 103, name: 'Eliteserien',         country: 'Norway' },
  { id: 113, name: 'Allsvenskan',         country: 'Sweden' },
  { id: 271, name: 'Süper Lig (Cyprus)',  country: 'Cyprus' },
]

const RATE_LIMIT_MS = 300 // API-Football 10 req/sec 制限への余裕

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// DB の dob (TIMESTAMP, JST 0:00 を UTC で持っている) を YYYY-MM-DD (JST) に整形
function dbDobToYYYYMMDD(d) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })
}

// 名前正規化 (大文字小文字 + スペース + アクセント無視)
function norm(s) {
  if (!s) return ''
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // diacritics
    .replace(/[\s\-·.]+/g, '')
    .toLowerCase()
}

// 候補の中から name_en 類似度で最良を選ぶ
function pickBestByName(apiPlayer, candidates) {
  const apiFull = norm(`${apiPlayer.firstname ?? ''}${apiPlayer.lastname ?? ''}`)
  const apiAlt = norm(apiPlayer.name ?? '')
  let best = null
  let bestScore = -1
  for (const c of candidates) {
    const dbName = norm(c.name_en ?? '')
    if (!dbName) continue
    // 含有関係で簡易採点
    const inc1 = dbName.includes(apiFull) || apiFull.includes(dbName)
    const inc2 = dbName.includes(apiAlt)  || apiAlt.includes(dbName)
    const score = (inc1 ? 2 : 0) + (inc2 ? 1 : 0)
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  return best
}

console.log(`\n=== 海外日本人選手 discover (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===`)
console.log(`シーズン: ${SEASON}, 対象リーグ: ${TARGET_LEAGUES.length}\n`)

const discovered = []     // すべての発見 player ({apiPlayer, league, team, ...})
const matched = []        // canonical_id に紐付いた発見
const unmatched = []      // canonical_id を引けなかった日本人 (= 新規 player)
const ambiguous = []      // dob 複数候補から絞れなかったケース

let apiCallCount = 0
let teamCount = 0

for (const league of TARGET_LEAGUES) {
  process.stdout.write(`\n📍 [${league.country}] ${league.name} (id=${league.id}) ...`)
  let teams
  try {
    teams = await fetchTeamsByLeague(league.id, SEASON)
    apiCallCount += 1
  } catch (e) {
    console.log(` ❌ teams 取得失敗: ${e.message}`)
    continue
  }
  console.log(` ${teams.length} チーム`)

  for (const t of teams) {
    teamCount += 1
    await sleep(RATE_LIMIT_MS)
    let page = 1
    while (true) {
      let res
      try {
        res = await fetchPlayersByTeam(t.team.id, SEASON, page)
        apiCallCount += 1
      } catch (e) {
        console.log(`    ⚠ ${t.team.name} page=${page} 失敗: ${e.message}`)
        break
      }
      const jps = res.filter((p) => p.player?.nationality === 'Japan')
      if (jps.length > 0) {
        for (const p of jps) {
          const apiP = p.player
          const stat = p.statistics?.[0]
          discovered.push({
            apiPlayer: apiP,
            apiTeam: t.team,
            apiLeague: league,
            position: stat?.games?.position ?? null,
          })
        }
      }
      // pagination
      const total = res.length
      if (total < 20) break // ページサイズ未満なら最終ページ
      page += 1
      if (page > 5) break // 1チーム 100 人超は想定外、安全停止
      await sleep(RATE_LIMIT_MS)
    }
  }
}

console.log(`\n\n✅ API 呼び出し: ${apiCallCount} 回 (チーム巡回: ${teamCount})`)
console.log(`✅ 日本人発見: ${discovered.length} 件\n`)

// canonical_id へ紐付け
for (const d of discovered) {
  const apiP = d.apiPlayer
  const dobYMD = apiP.birth?.date
  if (!dobYMD) {
    unmatched.push({ ...d, reason: 'no birth.date' })
    continue
  }
  const cands = (await pool.query(
    `SELECT id, name_ja, name_en, dob, is_active, team_id
     FROM players_master
     WHERE dob = $1::date`,
    [dobYMD],
  )).rows
  if (cands.length === 0) {
    unmatched.push({ ...d, reason: 'dob 該当無し' })
    continue
  }
  let chosen
  if (cands.length === 1) {
    chosen = cands[0]
  } else {
    chosen = pickBestByName(apiP, cands)
    if (!chosen) {
      ambiguous.push({ ...d, candidates: cands })
      continue
    }
  }
  matched.push({ ...d, canonical: chosen })
}

console.log(`📊 matched   : ${matched.length}`)
console.log(`⚠️  ambiguous : ${ambiguous.length}`)
console.log(`❌ unmatched : ${unmatched.length}\n`)

// MATCHED の一覧表示
if (matched.length) {
  console.log('\n--- MATCHED ---')
  for (const m of matched) {
    console.log(
      `  ${m.canonical.id} ${m.canonical.name_ja} (${m.canonical.name_en})` +
      ` → ${m.apiTeam.name} [${m.apiLeague.name}/${m.apiLeague.country}]` +
      ` ${m.canonical.is_active ? '*active*' : ''}`,
    )
  }
}
if (ambiguous.length) {
  console.log('\n--- AMBIGUOUS (要手動判定) ---')
  for (const a of ambiguous) {
    console.log(`  ${a.apiPlayer.firstname} ${a.apiPlayer.lastname} (${a.apiPlayer.birth?.date})`)
    for (const c of a.candidates) {
      console.log(`     候補: ${c.id} ${c.name_ja} (${c.name_en})`)
    }
  }
}
if (unmatched.length) {
  console.log('\n--- UNMATCHED (DB 未登録の可能性) ---')
  for (const u of unmatched) {
    console.log(`  ${u.apiPlayer.firstname} ${u.apiPlayer.lastname} (${u.apiPlayer.birth?.date}) [${u.reason}]`)
  }
}

// APPLY フェーズ
if (APPLY && matched.length) {
  console.log('\n\n=== APPLY ===')
  for (const m of matched) {
    const apiP = m.apiPlayer
    await pool.query(
      `INSERT INTO player_overseas_status
         (canonical_id, api_football_id, team_id, team_name, team_logo,
          league_id, league_name, country, season, position, fetched_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (canonical_id) DO UPDATE SET
         api_football_id = EXCLUDED.api_football_id,
         team_id         = EXCLUDED.team_id,
         team_name       = EXCLUDED.team_name,
         team_logo       = EXCLUDED.team_logo,
         league_id       = EXCLUDED.league_id,
         league_name     = EXCLUDED.league_name,
         country         = EXCLUDED.country,
         season          = EXCLUDED.season,
         position        = EXCLUDED.position,
         fetched_at      = NOW()`,
      [
        m.canonical.id,
        apiP.id ?? null,
        m.apiTeam.id ?? null,
        m.apiTeam.name,
        m.apiTeam.logo ?? null,
        m.apiLeague.id,
        m.apiLeague.name,
        m.apiLeague.country,
        SEASON,
        m.position,
      ],
    )
    // player_external_ids の補完
    if (apiP.id) {
      await pool.query(
        `INSERT INTO player_external_ids (canonical_id, source, external_id, observed_at)
         VALUES ($1, 'api-football', $2, NOW())
         ON CONFLICT DO NOTHING`,
        [m.canonical.id, String(apiP.id)],
      )
    }
  }

  // 古い行の掃除: 今回 matched に無い canonical_id を player_overseas_status から消す
  const matchedIds = matched.map((m) => m.canonical.id)
  if (matchedIds.length) {
    const placeholders = matchedIds.map((_, i) => `$${i + 1}`).join(',')
    const removed = await pool.query(
      `DELETE FROM player_overseas_status
       WHERE canonical_id NOT IN (${placeholders})
       RETURNING canonical_id`,
      matchedIds,
    )
    console.log(`🧹 stale row 削除: ${removed.rowCount}`)
  }

  console.log('✅ upsert 完了')
} else if (!APPLY) {
  console.log('\n(--apply を付けると DB へ書き込みます)')
}

await pool.end()
