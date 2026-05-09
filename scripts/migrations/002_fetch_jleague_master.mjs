// Phase 2 / Step 1: J-League SFIX03 から全選手データを取得
//
// やること:
//   - https://data.j-league.or.jp/SFIX03/search を1リクエストで取得
//   - HTML をパース → 選手リスト抽出
//   - 「正式名（別表記）」併記をパースして primary + aliases に分離
//   - data/jleague-snapshot-YYYYMMDD.json に保存
//
// 重要:
//   - DB には一切触らない (純粋なデータ取得のみ)
//   - 1リクエスト・3.6MB・約0.3秒
//   - ブラウザ装った User-Agent で匿名アクセス
//
// 実行: node ./scripts/migrations/002_fetch_jleague_master.mjs

import * as cheerio from 'cheerio'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

const URL = 'https://data.j-league.or.jp/SFIX03/search'
const TODAY = new Date().toISOString().slice(0, 10).replace(/-/g, '')
const OUT_FILE = `data/jleague-snapshot-${TODAY}.json`

// ブラウザ装う匿名User-Agent
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja',
}

// 「正式名（別表記）」を分離
//   "レオ セアラ（レオナルド）" → { primary: "レオ セアラ", aliases: ["レオナルド"] }
//   "舩橋 佑（船橋 佑）"        → { primary: "舩橋 佑", aliases: ["船橋 佑"] }
//   "テテ イェンギ（イェンギ）" → { primary: "テテ イェンギ", aliases: ["イェンギ"] }
//   "山田 太郎"                 → { primary: "山田 太郎", aliases: [] }
function parseNameWithAliases(name) {
  const m = name.match(/^(.+?)（(.+?)）\s*$/)
  if (!m) return { primary: name.trim(), aliases: [] }
  const primary = m[1].trim()
  // 括弧内に「、」で複数併記の可能性に対応
  const aliases = m[2].split(/[、,]/).map(s => s.trim()).filter(Boolean)
  return { primary, aliases }
}

// "1988/03/27" → "1988-03-27"
function parseDob(s) {
  if (!s) return null
  const m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

// "176/67" → { height_cm: 176, weight_kg: 67 }
function parseSize(s) {
  if (!s) return { height_cm: null, weight_kg: null }
  const m = s.match(/^(\d+)\s*\/\s*(\d+)$/)
  return m ? { height_cm: Number(m[1]), weight_kg: Number(m[2]) } : { height_cm: null, weight_kg: null }
}

console.log(`\n=== Phase 2 Step 1: SFIX03 取得 ===\n`)
console.log(`URL: ${URL}`)
console.log(`User-Agent: (匿名 - 普通のSafariを装う)`)

// 取得
const t0 = Date.now()
const res = await fetch(URL, { headers: HEADERS })
const elapsed = Date.now() - t0

if (!res.ok) {
  console.error(`✗ HTTP ${res.status}: ${res.statusText}`)
  process.exit(1)
}

const html = await res.text()
console.log(`✓ HTTP ${res.status}, ${(html.length / 1024 / 1024).toFixed(2)}MB, ${elapsed}ms\n`)

// パース
const $ = cheerio.load(html)
const players = []
const parseErrors = []

$('input[name="playerIdList"]').each((i, inp) => {
  const id = $(inp).attr('value')
  const tr = $(inp).closest('tr')
  const tds = tr.find('td').map((_, td) => $(td).text().trim().replace(/\s+/g, ' ')).get()

  // td構成: [名前, 英語名, 最終所属, ポジション, 生年月日, 身長/体重]
  if (tds.length < 6) {
    parseErrors.push({ id, reason: `td count ${tds.length}`, raw: tds })
    return
  }

  const { primary, aliases } = parseNameWithAliases(tds[0])
  const size = parseSize(tds[5])

  players.push({
    jleague_id: id,
    name_ja: primary,
    aliases,
    name_en: tds[1] || null,
    last_team: tds[2] || null,
    position: tds[3] || null,
    dob: parseDob(tds[4]),
    height_cm: size.height_cm,
    weight_kg: size.weight_kg,
  })
})

if (parseErrors.length > 0) {
  console.warn(`⚠️ パースエラー ${parseErrors.length}件:`)
  console.table(parseErrors.slice(0, 5))
}

// 統計
const posCount = {}
const teamCount = {}
let aliasCount = 0
for (const p of players) {
  posCount[p.position] = (posCount[p.position] ?? 0) + 1
  if (p.last_team) teamCount[p.last_team] = (teamCount[p.last_team] ?? 0) + 1
  if (p.aliases.length > 0) aliasCount++
}

console.log(`総選手数: ${players.length}`)
console.log(`\nポジション内訳:`)
console.table(posCount)
console.log(`\n別表記併記あり: ${aliasCount}件 (例: "レオ セアラ（レオナルド）")`)

// dob の充実度
const withDob = players.filter(p => p.dob).length
const withEn = players.filter(p => p.name_en).length
const withSize = players.filter(p => p.height_cm).length
console.log(`\nデータ充実度:`)
console.log(`  dob あり    : ${withDob} / ${players.length} (${(withDob/players.length*100).toFixed(1)}%)`)
console.log(`  英語名あり  : ${withEn} / ${players.length} (${(withEn/players.length*100).toFixed(1)}%)`)
console.log(`  身長体重あり: ${withSize} / ${players.length} (${(withSize/players.length*100).toFixed(1)}%)`)

// 保存
mkdirSync(dirname(OUT_FILE), { recursive: true })
writeFileSync(OUT_FILE, JSON.stringify({
  fetched_at: new Date().toISOString(),
  source_url: URL,
  total: players.length,
  parse_errors: parseErrors,
  players,
}, null, 2))

console.log(`\n✅ 保存: ${OUT_FILE} (${(JSON.stringify(players).length / 1024 / 1024).toFixed(2)}MB)`)
console.log(`\n次: scripts/migrations/003_match_jleague_dry_run.mjs (突合DRY-RUN)`)

// サンプル表示
console.log(`\nサンプル (別表記持ち5件):`)
console.table(
  players.filter(p => p.aliases.length > 0).slice(0, 5).map(p => ({
    jleague_id: p.jleague_id,
    name_ja: p.name_ja,
    aliases: p.aliases.join(', '),
    last_team: p.last_team,
    position: p.position,
  }))
)
