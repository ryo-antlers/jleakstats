// 海外リーグでプレーする「J 所属歴のある」選手 (日本人 + 元 J 外国人) を
// API-Football から発見し、canonical_id へ紐付けて player_overseas_status を埋める。
//
// マッチング戦略:
//   1) 国籍は不問。API-Football 全選手 vs jleakstats DB の「J 所属歴あり」プール
//   2) dob (生年月日) 完全一致を必須条件
//   3) 同じ dob で複数候補が出た場合は name_en で絞り込み (substring 包含)
//   4) is_active=true の選手は J リーグ復帰済みなので除外
//
// 実行 (dry-run):
//   node --env-file=.env.local scripts/discover_japanese_overseas.mjs
// 適用 (DB 書き込み):
//   node --env-file=.env.local scripts/discover_japanese_overseas.mjs --apply
// 日本人だけに絞る (旧挙動):
//   node --env-file=.env.local scripts/discover_japanese_overseas.mjs --jp-only --apply
//
// API-Football Pro plan (7,500/day) 前提。46 リーグ巡回で ~2,100 call / ~22 min。

import fs from 'node:fs'
import path from 'node:path'
import { Pool } from '@neondatabase/serverless'
import {
  fetchTeamsByLeague,
  fetchPlayersByTeam,
  sleep,
} from '../lib/api-football.js'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const USE_CACHE = args.includes('--use-cache')   // 直近の discover 結果を再利用 (API 0 call)
const SAVE_CACHE = args.includes('--save-cache') // 今回の discover 結果を JSON に保存
const JP_ONLY = args.includes('--jp-only')       // 日本人だけ拾う (旧挙動。foreigner ex-J は除外)
const SEASON =
  Number(args[args.indexOf('--season') + 1]) ||
  // 欧州 25-26 シーズン (2026/5 時点ではほぼ終了)。MLS / 北欧は同年カレンダー
  2025
const CACHE_PATH = path.join(
  process.cwd(),
  `tmp/overseas_discover_${SEASON}.json`,
)

// 対象リーグ。API-Football の league_id を直書き。
// 日本人選手が居る・居る可能性のあるリーグを優先。
//
// 処理順序は「主要リーグ → 下部リーグ・loan 先」とする。
// 同一選手が複数 squad に居る場合は last-write-wins なので、
// loan 先 (= 実際にプレーしてるクラブ) が DB に残るように下に置く。
const TARGET_LEAGUES = [
  // ===== 主要欧州 トップ =====
  { id: 39,  name: 'Premier League',           country: 'England' },
  { id: 140, name: 'La Liga',                  country: 'Spain' },
  { id: 135, name: 'Serie A',                  country: 'Italy' },
  { id: 78,  name: 'Bundesliga',               country: 'Germany' },
  { id: 61,  name: 'Ligue 1',                  country: 'France' },
  { id: 88,  name: 'Eredivisie',               country: 'Netherlands' },
  { id: 94,  name: 'Primeira Liga',            country: 'Portugal' },
  { id: 144, name: 'Jupiler Pro League',       country: 'Belgium' },
  { id: 179, name: 'Premiership',              country: 'Scotland' },
  { id: 203, name: 'Süper Lig',                country: 'Turkey' },
  { id: 207, name: 'Super League',             country: 'Switzerland' },
  { id: 218, name: 'Bundesliga (AUT)',         country: 'Austria' },
  { id: 197, name: 'Super League 1',           country: 'Greece' },

  // ===== 北欧 =====
  { id: 119, name: 'Superliga',                country: 'Denmark' },
  { id: 103, name: 'Eliteserien',              country: 'Norway' },
  { id: 113, name: 'Allsvenskan',              country: 'Sweden' },

  // ===== 中欧・東欧・島嶼 =====
  { id: 271, name: 'NB I',                     country: 'Hungary' },
  { id: 106, name: 'Ekstraklasa',              country: 'Poland' },
  { id: 345, name: 'Czech Liga',               country: 'Czech Republic' },
  { id: 210, name: 'HNL',                      country: 'Croatia' },
  { id: 318, name: '1. Division',              country: 'Cyprus' }, // 旧コードで 271 と書いていたが 271 は Hungary

  // ===== 北米 =====
  { id: 253, name: 'Major League Soccer',      country: 'USA' },
  { id: 262, name: 'Liga MX',                  country: 'Mexico' },

  // ===== 南米 =====
  { id: 71,  name: 'Brasileiro Série A',       country: 'Brazil' },

  // ===== 中東・アジア =====
  { id: 307, name: 'Pro League',               country: 'Saudi Arabia' },
  { id: 301, name: 'Pro League',               country: 'United Arab Emirates' },
  { id: 305, name: 'Stars League',             country: 'Qatar' },
  { id: 292, name: 'K League 1',               country: 'South Korea' },
  { id: 188, name: 'A-League',                 country: 'Australia' },
  { id: 296, name: 'Thai League 1',            country: 'Thailand' },
  { id: 274, name: 'Liga 1',                   country: 'Indonesia' },
  { id: 169, name: 'Super League',             country: 'China' },

  // ===== 欧州 2 部・下部 (loan 先で頻出。同一選手は last-write-wins でこちらが残る) =====
  { id: 40,  name: 'Championship',             country: 'England' },
  { id: 41,  name: 'League One',               country: 'England' },
  { id: 42,  name: 'League Two',               country: 'England' },
  { id: 43,  name: 'National League',          country: 'England' },
  { id: 141, name: 'Segunda División',         country: 'Spain' },
  { id: 136, name: 'Serie B',                  country: 'Italy' },
  { id: 138, name: 'Serie C - Girone A',       country: 'Italy' },
  { id: 79,  name: '2. Bundesliga',            country: 'Germany' },
  { id: 80,  name: '3. Liga',                  country: 'Germany' },
  { id: 62,  name: 'Ligue 2',                  country: 'France' },
  { id: 63,  name: 'National 1',               country: 'France' },
  { id: 89,  name: 'Eerste Divisie',           country: 'Netherlands' },
  { id: 145, name: 'Challenger Pro League',    country: 'Belgium' },
  { id: 293, name: 'K League 2',               country: 'South Korea' },
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

// api と db で名前 token (3 文字以上) が 1 つでも一致するか?
// dob だけ偶然一致した別人を弾くための最低限のフィルタ。
function nameTokenOverlap(apiPlayer, dbCandidate) {
  const apiTokens = new Set(
    `${apiPlayer.firstname ?? ''} ${apiPlayer.lastname ?? ''} ${apiPlayer.name ?? ''}`
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3),
  )
  const dbTokens = (dbCandidate.name_en ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
  return dbTokens.some((t) => apiTokens.has(t))
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
const matched = []        // canonical_id に紐付いた発見 (is_active=false のみ)
const skippedActive = []  // is_active=true (= J リーグ復帰済み) → upsert スキップ
const unmatched = []      // canonical_id を引けなかった日本人 (= 新規 player)
const ambiguous = []      // dob 複数候補から絞れなかったケース

let apiCallCount = 0
let teamCount = 0

// --use-cache: 直近の discover 結果を再利用 (Phase 1 で再 apply するとき API 消費ゼロ)
if (USE_CACHE && fs.existsSync(CACHE_PATH)) {
  const cached = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'))
  discovered.push(...cached.discovered)
  console.log(`📦 cache 読込: ${discovered.length} 件 (${CACHE_PATH})`)
}

if (!USE_CACHE) for (const league of TARGET_LEAGUES) {
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
      // --jp-only: 日本人だけ。default: 全員 (matching 段で ex-J プールと突合)
      const targets = JP_ONLY
        ? res.filter((p) => p.player?.nationality === 'Japan')
        : res
      for (const p of targets) {
        const apiP = p.player
        if (!apiP?.birth?.date) continue // dob 無しは matching 不能なのでスキップ
        const stat = p.statistics?.[0]
        discovered.push({
          apiPlayer: apiP,
          apiTeam: t.team,
          apiLeague: league,
          position: stat?.games?.position ?? null,
        })
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
console.log(`✅ squad メンバー収集: ${discovered.length} 件${JP_ONLY ? ' (--jp-only)' : ''}\n`)

if (SAVE_CACHE && !USE_CACHE) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true })
  fs.writeFileSync(
    CACHE_PATH,
    JSON.stringify({ season: SEASON, savedAt: new Date().toISOString(), discovered }, null, 2),
  )
  console.log(`💾 cache 保存: ${CACHE_PATH}`)
}

// ex-J プールを 1 クエリで pre-load (5,000+ squad に対し per-row クエリ回避)
console.log('🔄 ex-J 候補プールを pre-load...')
const allExJ = (await pool.query(`
  SELECT pm.id, pm.name_ja, pm.name_en, pm.dob, pm.is_active, pm.team_id
  FROM players_master pm
  WHERE pm.dob IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM player_career_summary pcs
      WHERE pcs.canonical_id = pm.id
        AND pcs.team_id IS NOT NULL
        AND pcs.team_id NOT IN (4316, 4320, 4325, 7000)
    )
`)).rows
const exJByDob = new Map()
for (const row of allExJ) {
  const ymd = dbDobToYYYYMMDD(row.dob)
  if (!ymd) continue
  if (!exJByDob.has(ymd)) exJByDob.set(ymd, [])
  exJByDob.get(ymd).push(row)
}
console.log(`   → ${exJByDob.size} unique dobs, ${allExJ.length} 候補 をメモリへ\n`)

// canonical_id へ紐付け (in-memory lookup)
for (const d of discovered) {
  const apiP = d.apiPlayer
  const dobYMD = apiP.birth?.date
  if (!dobYMD) {
    unmatched.push({ ...d, reason: 'no birth.date' })
    continue
  }
  const cands = exJByDob.get(dobYMD) ?? []
  if (cands.length === 0) {
    // ex-J プールに該当 dob 無し = J 所属歴のない選手 (海外で完結) なので静かに無視
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
  // 名前完全否定の防衛: api と db で 1 文字も共通する token がなければスキップ
  // (例: 名前が全然違うのに dob だけ偶然一致したケースを弾く)
  if (!nameTokenOverlap(apiP, chosen)) {
    unmatched.push({ ...d, reason: `dob ${dobYMD} 一致するが name mismatch (db: ${chosen.name_ja})` })
    continue
  }
  // is_active=true は jleakstats 側で「現在Jリーグでプレー中」が確定している
  if (chosen.is_active === true) {
    skippedActive.push({ ...d, canonical: chosen })
    continue
  }
  matched.push({ ...d, canonical: chosen })
}

console.log(`📊 matched         : ${matched.length}`)
console.log(`⏭️  skipped (active): ${skippedActive.length}`)
console.log(`⚠️  ambiguous       : ${ambiguous.length}`)
console.log(`❌ unmatched       : ${unmatched.length}\n`)

// MATCHED の一覧表示
if (matched.length) {
  console.log('\n--- MATCHED (海外でプレー中、is_active=false) ---')
  for (const m of matched) {
    console.log(
      `  ${m.canonical.id} ${m.canonical.name_ja} (${m.canonical.name_en})` +
      ` → ${m.apiTeam.name} [${m.apiLeague.name}/${m.apiLeague.country}]`,
    )
  }
}
if (skippedActive.length) {
  console.log('\n--- SKIPPED (is_active=true → Jリーグ復帰済み) ---')
  for (const s of skippedActive) {
    console.log(
      `  ${s.canonical.id} ${s.canonical.name_ja} (${s.canonical.name_en})` +
      ` ↪ skip [API squad: ${s.apiTeam.name} / ${s.apiLeague.country}]`,
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
