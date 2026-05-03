// J.League Data Site フルスクレイパー
//
// 使い方:
//   node scripts/scrape-jleague-full.mjs --match 32925                    (1試合テスト、dry-run)
//   node scripts/scrape-jleague-full.mjs --match 32925 --apply            (1試合DB書き込み)
//   node scripts/scrape-jleague-full.mjs --season 2025 --league 98        (2025 J1 全試合, dry-run 先頭5件)
//   node scripts/scrape-jleague-full.mjs --season 2025 --league 98 --all --apply  (本番実行)
//
// フラグ:
//   --match <id>       単一試合モード
//   --season <y>       シーズン (default: 2025)
//   --league <id>      J.League competition_frame_ids (98=J1 に相当する内部ID, default: 1 (J1))
//   --limit <n>        処理上限 (default: 5)
//   --all              上限解除
//   --apply            DB書き込み有効
//   --delay-min <ms>   リクエスト間隔最小 (default: 2000)
//   --delay-max <ms>   リクエスト間隔最大 (default: 5000)

import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'
import * as cheerio from 'cheerio'

config({ path: '.env.local' })
const sql = neon(process.env.DATABASE_URL)

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
  'Accept-Encoding': 'gzip, deflate, br',
  'DNT': '1',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
}

// ─── CLI 引数 ────────────────────────────────────
const args = process.argv.slice(2)
const getArg = (k, d) => { const i = args.indexOf(k); return i === -1 ? d : args[i + 1] }
const hasFlag = k => args.includes(k)

const matchOnly    = getArg('--match', null)
const season       = Number(getArg('--season', 2025))
const leagueArg    = getArg('--league', null)
// 直接パラメータ指定（2026特別リーグなど、--season では足りないケース用）
// 例: --comp-years 20261 --comp-frame 35 で 2026 J1特別リーグ
const compYears    = getArg('--comp-years', String(season))
const compFrameId  = getArg('--comp-frame', leagueArg ?? '1')

// comp-frame から league_id を自動推定 (DB上のleague_id用、--league で明示指定可)
//   frame 35 = J1百年構想 → league_id 98
//   frame 36 = J2J3百年構想 → league_id 2
//   frame 1/2/3 = 通常J1/J2/J3 → そのまま
const FRAME_TO_LEAGUE_ID = { '35': 98, '36': 2, '1': 1, '2': 2, '3': 3, '11': 100, '30': 100 }
const leagueId     = leagueArg
  ? Number(leagueArg)
  : (FRAME_TO_LEAGUE_ID[String(compFrameId)] ?? Number(compFrameId))
const limit        = hasFlag('--all') ? Infinity : Number(getArg('--limit', 5))
const apply        = hasFlag('--apply')
const pastOnly     = hasFlag('--past-only')          // 完了試合のみ（未来スキップ）
const skipDone     = hasFlag('--skip-done')          // data_source='j-league' の試合を再処理しない
const broadcastOnly = hasFlag('--broadcast-only')    // 放送情報(broadcast_ja)のみ一覧から一括UPDATE
const roundsOnly   = hasFlag('--rounds-only')        // round / round_number のみ一覧から一括UPDATE
const recentN      = getArg('--recent', null)        // リスト末尾から最新N試合だけ対象（定期実行用）
const delayMinMs   = Number(getArg('--delay-min', 2000))
const delayMaxMs   = Number(getArg('--delay-max', 5000))

// ─── ユーティリティ ─────────────────────────────
function clean(s) {
  if (s == null) return null
  return String(s).replace(/[\u3000\s]+/g, ' ').trim() || null
}
function parseIntOrNull(s) {
  if (!s) return null
  const m = String(s).replace(/,/g, '').match(/-?\d+/)
  return m ? parseInt(m[0], 10) : null
}
function parseFloatOrNull(s) {
  if (!s) return null
  const m = String(s).match(/-?\d+(\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}
function parseMinuteBase(s) {
  if (!s) return null
  const m = String(s).match(/^(\d+)/)
  return m ? parseInt(m[1], 10) : null
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
// 一覧ページの日付文字列 "YY/MM/DD(dow)" → YYYYMMDD 数値（比較用、パース失敗時 0）
function parseListDate(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})/.exec(s ?? '')
  return m ? parseInt(`20${m[1]}${m[2]}${m[3]}`, 10) : 0
}
// "第１節第１日" / "第1節" → 1。決勝・準々決勝などリーグ戦以外は null
function parseRoundNumber(s) {
  if (!s) return null
  const n = s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  const m = /第(\d+)節/.exec(n)
  return m ? parseInt(m[1], 10) : null
}
function randDelay() { return delayMinMs + Math.random() * (delayMaxMs - delayMinMs) }
// 過去シーズンの旧名義 → 現行 teams_master の表記 へのエイリアス
//   同一クラブの改名のみ（消滅/分裂した別クラブは teams_master に別レコードとして登録）
const TEAM_NAME_ALIASES = new Map([
  ['コンサドーレ札幌', '北海道コンサドーレ札幌'],   // 〜2015 → 2016〜
  ['名古屋グランパスエイト', '名古屋グランパス'],    // 〜2007 → 2008〜
  ['ヴェルディ川崎', '東京ヴェルディ'],              // 〜2000 → 2001〜（東京移転）
  ['読売ヴェルディ', '東京ヴェルディ'],              // 1993 J1発足時の名称
  ['東京ヴェルディ1969', '東京ヴェルディ'],          // 2001〜2008（創立年併記期）※全角数字はnormalizeで半角化済み
  ['東京ヴェルディ1969', '東京ヴェルディ'],          // 2001〜2008 → 2009〜（1969除去）
  ['横浜マリノス', '横浜F・マリノス'],               // 〜1998 → 1999〜（フリューゲルス合併）
  ['ジェフユナイテッド市原', 'ジェフユナイテッド千葉'], // 〜2004 → 2005〜
  ['京都パープルサンガ', '京都サンガF.C.'],          // 〜2006 → 2007〜
  ['ベルマーレ平塚', '湘南ベルマーレ'],              // 〜1999 → 2000〜
  ['RB大宮アルディージャ', '大宮アルディージャ'],    // 2025〜 RB傘下で改称（teams_masterは旧名のまま）
  ['ザスパクサツ群馬', 'ザスパ群馬'],                // 〜2023 → 2024〜
  ['ザスパ草津', 'ザスパ群馬'],                      // 2005〜2013 → ザスパクサツ → ザスパ
  ['グルージャ盛岡', 'いわてグルージャ盛岡'],         // 〜2017 → 2018〜
  // 横浜フリューゲルス は1998年消滅・他クラブ合併で再編されたため teams_master の id=500 を使用
])
function normalizeTeamName(s) {
  if (!s) return ''
  const n = s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, c =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  ).replace(/．/g, '.')      // 全角ピリオド → 半角 (Y.S.C.C.横浜 等)
   .replace(/－/g, '-')      // 全角ハイフンマイナス → 半角 (U-23 等)
   .replace(/\s+/g, '')
  return TEAM_NAME_ALIASES.get(n) ?? n
}
// "2025/02/14" + "19:03" → Date (JST)
function toIsoDate(dateStr, timeStr) {
  if (!dateStr) return null
  const d = dateStr.replace(/\//g, '-')
  const t = timeStr ? timeStr : '00:00'
  return `${d}T${t}:00+09:00`
}
// 一覧行の "26/05/02(土)" + "14:00" → ISO datetime
function listDateToIso(listDate, kickoff) {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})/.exec(listDate ?? '')
  if (!m) return null
  const yyyy = `20${m[1]}`
  const t = (kickoff && /^\d{1,2}:\d{2}/.test(kickoff)) ? kickoff.padStart(5, '0').slice(0, 5) : '00:00'
  return `${yyyy}-${m[2]}-${m[3]}T${t}:00+09:00`
}

async function fetchText(url) {
  const res = await fetch(url, { headers: BROWSER_HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${url}`)
  return res.text()
}

// ─── Parser ─────────────────────────────────────
function parseMatchPage(html) {
  const $ = cheerio.load(html)

  // meta
  const metaTable = $('.two-column-table-bottom table').first()
  const headers = metaTable.find('thead th').map((_, th) => clean($(th).text())).get()
  const cells   = metaTable.find('tbody td').map((_, td) => clean($(td).text())).get()
  const metaRow = {}
  for (let i = 0; i < headers.length; i++) metaRow[headers[i]] = cells[i] ?? null
  const meta = {
    date: metaRow['日付'],
    kickoff_time: metaRow['キックオフ時刻'],
    stadium: metaRow['スタジアム'],
    attendance: parseIntOrNull(metaRow['入場者数']),
    weather: metaRow['天候'],
    temperature_c: parseFloatOrNull(metaRow['気温']),
    humidity_pct: parseIntOrNull(metaRow['湿度']),
  }

  // teams + score
  const h3Teams = $('h3').filter((_, el) => {
    const t = $(el).text().trim()
    return t && t !== 'HOME' && t !== 'AWAY'
  }).map((_, el) => clean($(el).text())).get()
  const scoreTds = $('td.score').map((_, td) => parseIntOrNull($(td).text())).get()
  const htHome = parseIntOrNull($('td.time dl').eq(0).find('dd.left-area').text())
  const htAway = parseIntOrNull($('td.time dl').eq(0).find('dd.right-area').text())

  const teams = {
    home_team: h3Teams[0] ?? null,
    away_team: h3Teams[1] ?? null,
    home_score: scoreTds[0] ?? null,
    away_score: scoreTds[1] ?? null,
    home_ht_score: htHome,
    away_ht_score: htAway,
  }

  // goals
  const goals = { home: [], away: [] }
  const goalsArea = $('.score-board-pk').filter((_, el) =>
    $(el).find('th').text().trim() === '得点',
  ).first()
  if (goalsArea.length) {
    goalsArea.find('td.left-area > table tr').each((_, tr) => {
      const c = $(tr).find('td').map((_, td) => clean($(td).text())).get().filter(Boolean)
      if (c.length >= 2) goals.home.push({ name: c[0], minute: c[1] })
    })
    goalsArea.find('td.right-area > table tr').each((_, tr) => {
      const c = $(tr).find('td').map((_, td) => clean($(td).text())).get().filter(Boolean)
      if (c.length >= 2) goals.away.push({ name: c[1], minute: c[0] })
    })
  }

  // penalty shootout (集計値)
  const pkArea = $('.score-board-pk').filter((_, el) =>
    $(el).find('th').text().trim() === 'PK戦' && $(el).find('td.left-area > table').length === 0,
  ).first()
  const pk = pkArea.length ? {
    home: parseIntOrNull(pkArea.find('td.left-area').first().text()),
    away: parseIntOrNull(pkArea.find('td.right-area').first().text()),
  } : { home: null, away: null }

  // PK戦キッカー (個別記録、時系列順)
  // HTML: .score-board-pk で th='PK戦' かつ left-area に nested table を持つ要素
  // 各行は 3列: (アイコン or 空) / 選手名 / (アイコン or 'first-kick'マーカー)
  // icon_c-w*.gif = 成功、icon_clo*.gif = 失敗
  const pkKicks = (() => {
    const $area = $('.score-board-pk').filter((_, el) =>
      $(el).find('th').text().trim() === 'PK戦' && $(el).find('td.left-area > table').length > 0,
    ).first()
    if (!$area.length) return []

    const parseSide = (cls) => {
      const rows = $area.find(`td.${cls} > table tr`).toArray()
      return rows.map(tr => {
        const $tr = $(tr)
        let name = null
        let imgSrc = null
        let isFirst = false
        $tr.find('td').each((_, td) => {
          const $td = $(td)
          if ($td.find('span.first-kick').length) { isFirst = true; return }
          const $img = $td.find('img').first()
          if ($img.length) { imgSrc = $img.attr('src') ?? ''; return }
          const txt = clean($td.text())
          if (txt && !name) name = txt
        })
        if (!name) return null
        const src = imgSrc ?? ''
        const success = src.includes('c-w')  // icon_c-w2.gif/icon_c-w.png = ○
        return { name, success, isFirst }
      }).filter(Boolean)
    }

    const home = parseSide('left-area')
    const away = parseSide('right-area')
    if (home.length === 0 && away.length === 0) return []
    const homeFirst = home.some(k => k.isFirst)
    const ordered = []
    const max = Math.max(home.length, away.length)
    for (let i = 0; i < max; i++) {
      if (homeFirst) {
        if (home[i]) ordered.push({ side: 'home', name: home[i].name, success: home[i].success })
        if (away[i]) ordered.push({ side: 'away', name: away[i].name, success: away[i].success })
      } else {
        if (away[i]) ordered.push({ side: 'away', name: away[i].name, success: away[i].success })
        if (home[i]) ordered.push({ side: 'home', name: home[i].name, success: home[i].success })
      }
    }
    return ordered.map((k, i) => ({ ...k, sequence: i + 1 }))
  })()

  // referees
  const refLabels = {}
  $('dl').each((_, dl) => {
    const $dl = $(dl)
    $dl.find('dt').each((i, dt) => {
      const label = clean($(dt).text())
      const value = clean($dl.find('dd').eq(i).text())
      if (label) refLabels[label] = value
    })
  })
  const referees = {
    main: refLabels['主審'] ?? null,
    assistants: refLabels['副審'] ?? null,
    fourth: refLabels['第4の審判員'] ?? null,
    var: refLabels['VAR／AVAR'] ?? refLabels['VAR/AVAR'] ?? null,
  }

  // section pairs (先発/控え/交代/警告/退場/監督)
  //   title は string または string[]（複数ラベル対応。例: ['監督','ヘッドコーチ']）
  function sectionPairs(title) {
    const titleSet = new Set(Array.isArray(title) ? title : [title])
    const result = { home: [], away: [] }
    const headings = $('h4').filter((_, el) => titleSet.has(clean($(el).text()))).toArray()
    headings.forEach((h4, idx) => {
      const $h4 = $(h4)
      const table = $h4.nextAll('div.two-column-table-base').first().find('table').first()
      const rows = table.find('tbody tr').map((_, tr) => {
        const $tr = $(tr)
        return {
          position: clean($tr.find('td.position').text()),
          number:   parseIntOrNull($tr.find('td.number').text()),
          name:     clean($tr.find('td.name').text()),
          time:     clean($tr.find('td.time').text()),
          change:   clean($tr.find('td.change').text()),
        }
      }).get().filter(r => r.name || r.time)
      const parentCls = $h4.parent().attr('class') ?? ''
      const side = parentCls.includes('-l') ? 'home' : parentCls.includes('-r') ? 'away' : (idx === 0 ? 'home' : 'away')
      result[side].push(...rows)
    })
    return result
  }

  return {
    meta,
    teams,
    goals,
    penalty_shootout: pk,
    pk_kicks: pkKicks,
    referees,
    starters:       sectionPairs('先発'),
    bench:          sectionPairs('控え'),
    substitutions:  sectionPairs('交代'),
    yellow_cards:   sectionPairs('警告'),
    red_cards:      sectionPairs('退場'),
    coaches:        sectionPairs(['監督', 'ヘッドコーチ']),
  }
}

// ─── DB 操作ヘルパー ─────────────────────────────
let teamNameToId = null
async function loadTeamNameMap() {
  if (teamNameToId) return teamNameToId
  const rows = await sql`
    SELECT id, name_ja, short_name FROM teams_master
    WHERE name_ja IS NOT NULL OR short_name IS NOT NULL
  `
  const m = new Map()
  for (const r of rows) {
    if (r.name_ja)    m.set(normalizeTeamName(r.name_ja), r.id)
    if (r.short_name) m.set(normalizeTeamName(r.short_name), r.id)
  }
  teamNameToId = m
  return m
}

function resolveTeamId(name, map) {
  if (!name) return null
  const key = normalizeTeamName(name)
  return map.get(key) ?? null
}

// 9000000+ カスタム選手IDのカウンタ（セッション全体で共有）
let nextCustomPlayerId = null
async function ensurePlayerIdCounter() {
  if (nextCustomPlayerId != null) return
  const maxRes = await sql`
    SELECT COALESCE(MAX(id), 8999999) AS max_id
    FROM players_master WHERE id >= 9000000
  `
  nextCustomPlayerId = Number(maxRes[0].max_id) + 1
}

// 9000000+ カスタム選手の name_ja → id マップをセッションごとに1回だけロードしてキャッシュ
// 新規追加時は resolvePlayer 経由でマップにも反映 (loadCustomPlayerCache 直後に同期)
let customPlayerCache = null
async function loadCustomPlayerCache() {
  if (customPlayerCache) return customPlayerCache
  const rows = await sql`SELECT id, name_ja FROM players_master WHERE id >= 9000000`
  customPlayerCache = new Map()
  for (const r of rows) customPlayerCache.set(r.name_ja, r.id)
  console.log(`[cache] custom players preloaded: ${customPlayerCache.size}件`)
  return customPlayerCache
}

// パイプライン実行中、直前の試合で割当てた選手IDをDB未コミットでも参照できるようにする
const recentlyAllocatedPlayers = new Map()  // name_ja → id

// ─── 試合データを準備（fetch + parse + クエリ構築、DB書き込みは行わない）────
async function prepareMatch(matchCardId, { apply, league, skipDone, broadcast, isCompleted = true }) {
  // skip-done チェック (fetch 前)
  if (skipDone) {
    const already = await sql`
      SELECT 1 FROM fixtures
      WHERE id = ${matchCardId} AND data_source = 'j-league'
      LIMIT 1
    `
    if (already.length > 0) return { skipped: true, matchCardId }
  }

  const url = `https://data.j-league.or.jp/SFMS02/?match_card_id=${matchCardId}`
  const html = await fetchText(url)
  const parsed = parseMatchPage(html)

  const teamMap = await loadTeamNameMap()
  const homeId = resolveTeamId(parsed.teams.home_team, teamMap)
  const awayId = resolveTeamId(parsed.teams.away_team, teamMap)

  if (!homeId || !awayId) {
    throw new Error(`チーム未解決: home="${parsed.teams.home_team}"(${homeId}), away="${parsed.teams.away_team}"(${awayId})`)
  }

  const dateIso = toIsoDate(parsed.meta.date, parsed.meta.kickoff_time)
  const isoSeason = dateIso ? Number(dateIso.slice(0, 4)) : null
  const isPK = parsed.penalty_shootout.home != null
  const status = isCompleted ? (isPK ? 'PEN' : 'FT') : 'NS'
  const winner = !isCompleted
    ? null
    : (parsed.teams.home_score > parsed.teams.away_score ? 'home' :
       parsed.teams.home_score < parsed.teams.away_score ? 'away' :
       isPK ? (parsed.penalty_shootout.home > parsed.penalty_shootout.away ? 'home' : 'away') :
       'draw')
  const finishedAt = isCompleted ? dateIso : null

  // 重複チェック: 同じ日付+ホーム+アウェイの既存 fixture があればそのIDを使う
  const datePart = dateIso.slice(0, 10)  // JST基準の YYYY-MM-DD
  const existing = await sql`
    SELECT id, data_source FROM fixtures
    WHERE (date AT TIME ZONE 'Asia/Tokyo')::date = ${datePart}
      AND home_team_id = ${homeId}
      AND away_team_id = ${awayId}
      AND id <> ${matchCardId}
    LIMIT 1
  `
  const fixtureId = existing.length > 0 ? existing[0].id : matchCardId
  const isUpdate = existing.length > 0
  const srcInfo = isUpdate ? `既存fixture=${fixtureId} (${existing[0].data_source ?? 'api-football'}) を UPDATE` : `新規 id=${fixtureId}`

  const logLines = [
    `\n[match=${matchCardId}] ${parsed.meta.date} ${parsed.teams.home_team} ${parsed.teams.home_score}-${parsed.teams.away_score}${isPK ? ` (PK ${parsed.penalty_shootout.home}-${parsed.penalty_shootout.away})` : ''} ${parsed.teams.away_team}`,
    `  → ${srcInfo}`,
    `  審判: ${parsed.referees.main} | 会場: ${parsed.meta.stadium} (${parsed.meta.attendance?.toLocaleString()}人) | 天候: ${parsed.meta.weather} ${parsed.meta.temperature_c}°C ${parsed.meta.humidity_pct}%`,
    `  監督: ${parsed.coaches.home[0]?.name} vs ${parsed.coaches.away[0]?.name}`,
    `  スタメン: home=${parsed.starters.home.length}名 away=${parsed.starters.away.length}名`,
  ]

  if (!apply) {
    return { dryRun: true, fixtureId, matchCardId, logLines }
  }

  // 選手マップをまとめてプリロード (両チームの既存選手のみ毎回フェッチ; 9000000+ はキャッシュ参照)
  await ensurePlayerIdCounter()
  const customMap = await loadCustomPlayerCache()  // 起動時1回だけフェッチ、以降は同じMap参照
  const teamRows = await sql`
    SELECT id, name_ja, team_id FROM players_master
    WHERE team_id IN (${homeId}, ${awayId})
  `
  const playerByTeamName = new Map()  // `${team_id}:${name}` → id
  const playerByName9M   = new Map(customMap)  // name → id (9000000+ フォールバック; キャッシュをコピーしてローカル変更を許容)
  for (const r of teamRows) {
    playerByTeamName.set(`${r.team_id}:${r.name_ja}`, r.id)
  }
  // パイプライン前段の試合で割り当てたが未コミットの選手IDをマージ
  for (const [name, id] of recentlyAllocatedPlayers) {
    if (!playerByName9M.has(name)) playerByName9M.set(name, id)
  }

  const newPlayerRows = []
  function resolvePlayer(name, teamId, pos) {
    if (!name || !teamId) return null
    const k = `${teamId}:${name}`
    if (playerByTeamName.has(k)) return playerByTeamName.get(k)
    if (playerByName9M.has(name)) return playerByName9M.get(name)
    const id = nextCustomPlayerId++
    playerByTeamName.set(k, id)
    playerByName9M.set(name, id)
    customMap.set(name, id)  // モジュールキャッシュも同期 (次の試合のために)
    recentlyAllocatedPlayers.set(name, id)
    newPlayerRows.push({ id, name, teamId, pos })
    return id
  }

  // ─── クエリ構築（JS 側で player_id を全て解決してから並べる）───
  // 新規選手 INSERT はあとから先頭に prepend する（resolvePlayer で newPlayerRows が埋まるので）
  const queries = []

  // 2. Fixture 本体
  if (isUpdate) {
    queries.push(sql`
      UPDATE fixtures SET
        date                = ${dateIso},
        home_team_id        = ${homeId},
        away_team_id        = ${awayId},
        home_score          = ${parsed.teams.home_score},
        away_score          = ${parsed.teams.away_score},
        home_score_ht       = ${parsed.teams.home_ht_score},
        away_score_ht       = ${parsed.teams.away_ht_score},
        home_penalty        = ${parsed.penalty_shootout.home},
        away_penalty        = ${parsed.penalty_shootout.away},
        status              = ${status},
        winner              = ${winner},
        weather             = ${parsed.meta.weather},
        temperature_c       = ${parsed.meta.temperature_c},
        humidity_pct        = ${parsed.meta.humidity_pct},
        attendance          = ${parsed.meta.attendance},
        home_coach_ja       = ${parsed.coaches.home[0]?.name ?? null},
        away_coach_ja       = ${parsed.coaches.away[0]?.name ?? null},
        venue_name_ja       = ${parsed.meta.stadium},
        referee_ja_official = ${parsed.referees.main},
        broadcast_ja        = COALESCE(${broadcast ?? null}, fixtures.broadcast_ja),
        data_source         = 'j-league',
        finished_at         = ${finishedAt},
        updated_at          = NOW()
      WHERE id = ${fixtureId}
    `)
  } else {
    queries.push(sql`
      INSERT INTO fixtures (
        id, league_id, season, round, round_number, date,
        home_team_id, away_team_id,
        home_score, away_score, home_score_ht, away_score_ht,
        home_penalty, away_penalty,
        status, winner,
        weather, temperature_c, humidity_pct, attendance,
        home_coach_ja, away_coach_ja, venue_name_ja,
        referee_ja_official, broadcast_ja, data_source, finished_at,
        created_at, updated_at
      ) VALUES (
        ${fixtureId}, ${league}, ${isoSeason}, NULL, NULL, ${dateIso},
        ${homeId}, ${awayId},
        ${parsed.teams.home_score}, ${parsed.teams.away_score},
        ${parsed.teams.home_ht_score}, ${parsed.teams.away_ht_score},
        ${parsed.penalty_shootout.home}, ${parsed.penalty_shootout.away},
        ${status}, ${winner},
        ${parsed.meta.weather}, ${parsed.meta.temperature_c}, ${parsed.meta.humidity_pct}, ${parsed.meta.attendance},
        ${parsed.coaches.home[0]?.name ?? null}, ${parsed.coaches.away[0]?.name ?? null}, ${parsed.meta.stadium},
        ${parsed.referees.main}, ${broadcast ?? null}, 'j-league', ${finishedAt},
        NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        home_score          = EXCLUDED.home_score,
        away_score          = EXCLUDED.away_score,
        home_score_ht       = EXCLUDED.home_score_ht,
        away_score_ht       = EXCLUDED.away_score_ht,
        home_penalty        = EXCLUDED.home_penalty,
        away_penalty        = EXCLUDED.away_penalty,
        status              = EXCLUDED.status,
        winner              = EXCLUDED.winner,
        weather             = EXCLUDED.weather,
        temperature_c       = EXCLUDED.temperature_c,
        humidity_pct        = EXCLUDED.humidity_pct,
        attendance          = EXCLUDED.attendance,
        home_coach_ja       = EXCLUDED.home_coach_ja,
        away_coach_ja       = EXCLUDED.away_coach_ja,
        venue_name_ja       = EXCLUDED.venue_name_ja,
        referee_ja_official = EXCLUDED.referee_ja_official,
        broadcast_ja        = COALESCE(EXCLUDED.broadcast_ja, fixtures.broadcast_ja),
        data_source         = EXCLUDED.data_source,
        finished_at         = EXCLUDED.finished_at,
        updated_at          = NOW()
    `)
  }

  // 未開催 (NS) の場合は events/lineups の処理をスキップ
  // (試合詳細ページに無いため、parse結果も空配列。既存データも消さない)
  if (isCompleted) {

  // 3. 既存の events/lineups クリア
  queries.push(sql`DELETE FROM fixture_events  WHERE fixture_id = ${fixtureId}`)
  queries.push(sql`DELETE FROM fixture_lineups WHERE fixture_id = ${fixtureId}`)

  // 4. Lineups (先発 + 控え)
  for (const side of ['home', 'away']) {
    const teamId = side === 'home' ? homeId : awayId
    const coachJa = parsed.coaches[side][0]?.name ?? null
    for (const p of parsed.starters[side]) {
      const pid = resolvePlayer(p.name, teamId, p.position)
      queries.push(sql`
        INSERT INTO fixture_lineups (
          fixture_id, team_id, coach_name, coach_name_ja, formation,
          player_id, player_name_en, player_name_ja, number, position, is_starter
        ) VALUES (
          ${fixtureId}, ${teamId}, NULL, ${coachJa}, NULL,
          ${pid}, NULL, ${p.name}, ${p.number}, ${p.position}, true
        )
      `)
    }
    for (const p of parsed.bench[side]) {
      const pid = resolvePlayer(p.name, teamId, p.position)
      queries.push(sql`
        INSERT INTO fixture_lineups (
          fixture_id, team_id, coach_name, coach_name_ja, formation,
          player_id, player_name_en, player_name_ja, number, position, is_starter
        ) VALUES (
          ${fixtureId}, ${teamId}, NULL, ${coachJa}, NULL,
          ${pid}, NULL, ${p.name}, ${p.number}, ${p.position}, false
        )
      `)
    }
  }

  // 5. Events: goals
  for (const side of ['home', 'away']) {
    const teamId = side === 'home' ? homeId : awayId
    for (const g of parsed.goals[side]) {
      const pid = resolvePlayer(g.name, teamId, null)
      queries.push(sql`
        INSERT INTO fixture_events (
          fixture_id, elapsed, team_id, player_id, player_name_ja, type, detail
        ) VALUES (
          ${fixtureId}, ${parseMinuteBase(g.minute)}, ${teamId}, ${pid}, ${g.name}, 'Goal', 'Normal Goal'
        )
      `)
    }
  }

  // 6. Events: cards
  for (const side of ['home', 'away']) {
    const teamId = side === 'home' ? homeId : awayId
    for (const c of parsed.yellow_cards[side]) {
      const pid = resolvePlayer(c.name, teamId, null)
      queries.push(sql`
        INSERT INTO fixture_events (
          fixture_id, elapsed, team_id, player_id, player_name_ja, type, detail
        ) VALUES (
          ${fixtureId}, ${parseMinuteBase(c.time)}, ${teamId}, ${pid}, ${c.name}, 'Card', 'Yellow Card'
        )
      `)
    }
    for (const c of parsed.red_cards[side]) {
      const pid = resolvePlayer(c.name, teamId, null)
      queries.push(sql`
        INSERT INTO fixture_events (
          fixture_id, elapsed, team_id, player_id, player_name_ja, type, detail
        ) VALUES (
          ${fixtureId}, ${parseMinuteBase(c.time)}, ${teamId}, ${pid}, ${c.name}, 'Card', 'Red Card'
        )
      `)
    }
  }

  // 7. Events: substitutions
  for (const side of ['home', 'away']) {
    const teamId = side === 'home' ? homeId : awayId
    const list = parsed.substitutions[side]
    for (let i = 0; i < list.length; i += 2) {
      const out = list[i]
      const inn = list[i + 1]
      if (!out || !inn) continue
      const outPid = resolvePlayer(out.name, teamId, null)
      const inPid  = resolvePlayer(inn.name, teamId, null)
      queries.push(sql`
        INSERT INTO fixture_events (
          fixture_id, elapsed, team_id,
          player_id, player_name_ja,
          assist_id, assist_name_ja,
          type, detail
        ) VALUES (
          ${fixtureId}, ${parseMinuteBase(out.time)}, ${teamId},
          ${inPid}, ${inn.name},
          ${outPid}, ${out.name},
          'subst', 'Substitution'
        )
      `)
    }
  }

  // 8. PK戦キッカー (時系列順、elapsed=120+sequence で extra time 後に並ぶ)
  for (const k of parsed.pk_kicks) {
    const teamId = k.side === 'home' ? homeId : awayId
    const pid = resolvePlayer(k.name, teamId, null)
    queries.push(sql`
      INSERT INTO fixture_events (
        fixture_id, elapsed, team_id,
        player_id, player_name_ja,
        type, detail
      ) VALUES (
        ${fixtureId}, ${120 + k.sequence}, ${teamId},
        ${pid}, ${k.name},
        'Penalty Shootout', ${k.success ? 'Goal' : 'Missed'}
      )
    `)
  }

  } // end if (isCompleted)

  // 新規選手 INSERT を先頭に挿入（他のINSERT/UPDATEが FK 参照する前にコミットされる必要あり）
  const playerInserts = newPlayerRows.map(p => sql`
    INSERT INTO players_master (id, name_ja, team_id, position, updated_at)
    VALUES (${p.id}, ${p.name}, ${p.teamId}, ${p.pos ?? null}, NOW())
    ON CONFLICT (id) DO NOTHING
  `)
  const allQueries = [...playerInserts, ...queries]

  return { matchCardId, fixtureId, logLines, queries: allQueries, newPlayerCount: newPlayerRows.length }
}

// ─── 単一試合のコミット（全クエリを1トランザクションで送信）──
// ─── 未開催試合準備 (詳細ページfetchせず、リスト行データだけで INSERT/UPDATE) ────
async function prepareFutureMatch(target, { apply, league }) {
  const teamMap = await loadTeamNameMap()
  const homeId = resolveTeamId(target.home, teamMap)
  const awayId = resolveTeamId(target.away, teamMap)
  if (!homeId || !awayId) {
    throw new Error(`チーム未解決 (未開催): home="${target.home}"(${homeId}), away="${target.away}"(${awayId})`)
  }

  const dateIso = listDateToIso(target.date, target.kickoff)
  if (!dateIso) {
    throw new Error(`日付parse失敗: date="${target.date}" kickoff="${target.kickoff}"`)
  }
  const [y, m, d] = dateIso.slice(0, 10).split('-').map(Number)

  // 既存fixture (date+teams) を探す → あればそのIDをUPDATE、無ければsynthetic IDで新規INSERT
  const datePart = dateIso.slice(0, 10)
  const existing = await sql`
    SELECT id, data_source, status FROM fixtures
    WHERE (date AT TIME ZONE 'Asia/Tokyo')::date = ${datePart}
      AND home_team_id = ${homeId}
      AND away_team_id = ${awayId}
    LIMIT 1
  `
  const isUpdate = existing.length > 0
  const fixtureId = isUpdate ? existing[0].id : syntheticFutureId(y, m, d, homeId)

  const queries = []
  if (isUpdate) {
    queries.push(sql`
      UPDATE fixtures SET
        date          = ${dateIso},
        venue_name_ja = COALESCE(${target.stadium || null}, venue_name_ja),
        round         = COALESCE(${target.round || null}, round),
        round_number  = COALESCE(${target.roundNumber ?? null}, round_number),
        stage_ja      = COALESCE(${target.stageJa || null}, stage_ja),
        broadcast_ja  = COALESCE(${target.broadcast || null}, broadcast_ja),
        updated_at    = NOW()
      WHERE id = ${fixtureId}
    `)
  } else {
    queries.push(sql`
      INSERT INTO fixtures (
        id, league_id, season, round, round_number, stage_ja, date,
        home_team_id, away_team_id, venue_name_ja, broadcast_ja,
        status, data_source, created_at, updated_at
      ) VALUES (
        ${fixtureId}, ${league}, ${y}, ${target.round || null}, ${target.roundNumber ?? null}, ${target.stageJa || null}, ${dateIso},
        ${homeId}, ${awayId}, ${target.stadium || null}, ${target.broadcast || null},
        'NS', 'j-league', NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        date          = EXCLUDED.date,
        venue_name_ja = EXCLUDED.venue_name_ja,
        broadcast_ja  = COALESCE(EXCLUDED.broadcast_ja, fixtures.broadcast_ja),
        updated_at    = NOW()
    `)
  }

  return {
    matchCardId: fixtureId,
    queries,
    logLines: [
      `\n[future] ${target.date} ${target.kickoff || ''} ${target.home} vs ${target.away} ${target.stadium ? `@${target.stadium}` : ''}`,
      `  → ${isUpdate ? `既存fixture=${fixtureId} (${existing[0].data_source ?? 'api-football'}) を UPDATE` : `新規 (synthetic) id=${fixtureId}`}`,
    ],
    dryRun: !apply,
    newPlayerCount: 0,
  }
}

async function commitMatch(prep) {
  await sql.transaction(prep.queries)
}

// 未開催試合用 synthetic ID 生成 (date + homeId からデターミニスティック)
//   formula: (season-2020)*1e8 + monthDay*1e4 + (homeId mod 10000)
//   for 2026-05-03 home=290 → 6*1e8 + 503*1e4 + 290 = 605030290 (INT4内に収まる)
function syntheticFutureId(year, month, day, homeId) {
  return (year - 2020) * 100_000_000 + (month * 100 + day) * 10_000 + (homeId % 10_000)
}

// ─── 試合一覧取得 ────────────────────────────────
async function fetchMatchListForSeason(yearsParam, frameIdParam) {
  const params = new URLSearchParams({
    competition_years: String(yearsParam),
    competition_frame_ids: String(frameIdParam),
    tv_relay_station_name: '',  // ← これを付けると未開催試合も同じリストに含まれる
  })
  const url = `https://data.j-league.or.jp/SFMS01/search?${params.toString()}`
  console.log(`[list] ${url}`)
  const html = await fetchText(url)
  const $ = cheerio.load(html)
  const rows = []
  const seen = new Set()
  $('table tr').each((_, tr) => {
    const cells = $(tr).find('td').map((_, td) => clean($(td).text())).get()
    if (cells.length < 8) return  // ヘッダー行などをスキップ

    const link = $(tr).find('a[href*="match_card_id="]').first().attr('href')
    const m = link?.match(/match_card_id=(\d+)/)
    const matchCardId = m ? Number(m[1]) : null  // null = 未開催 (synthetic ID 後で付与)
    if (matchCardId != null && seen.has(matchCardId)) return
    if (matchCardId != null) seen.add(matchCardId)
    // cells: [0]年, [1]リーグ, [2]節, [3]日付, [4]KO, [5]ホーム, [6]スコア,
    //        [7]アウェイ, [8]スタジアム, [9]入場者数, [10]インターネット中継・TV放送
    const score = cells[6] ?? ''
    const isCompleted = /\d+\s*[-−ー‐]\s*\d+/.test(score)  // "2-5" 系のみ完了扱い
    // cells[1] 例: "Ｊ１", "Ｊ１ ２ｎｄ", "Ｊ１ サントリー", "明治安田チャンピオンシップ"
    //   全角英数字 → 半角 + 全角スペース → 半角スペース で正規化
    const stageRaw = cells[1] ?? null
    const stageJa = stageRaw
      ? stageRaw.replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\u3000/g, ' ').trim() || null
      : null
    rows.push({
      matchCardId,
      date: cells[3] ?? '',
      kickoff: cells[4] ?? '',
      score,
      home: cells[5] ?? '',
      away: cells[7] ?? '',
      stadium: cells[8] ?? '',
      stageJa,
      round: cells[2] ?? null,
      roundNumber: parseRoundNumber(cells[2]),
      broadcast: cells[10] ?? null,
      isCompleted,
    })
  })
  return rows
}

// ─── Main ───────────────────────────────────────
console.log('\n=== J.League Full Scraper ===')
console.log(`mode: ${apply ? 'APPLY' : 'DRY-RUN'}, delay ${delayMinMs}〜${delayMaxMs}ms`)

try {
  if (matchOnly) {
    console.log(`Single match: match_card_id=${matchOnly}`)
    const prep = await prepareMatch(Number(matchOnly), { apply, league: leagueId, skipDone })
    if (prep.skipped) {
      console.log(`[match=${prep.matchCardId}] skip (already j-league)`)
    } else {
      for (const line of prep.logLines) console.log(line)
      if (prep.dryRun) {
        console.log('  (dry-run, DB未書き込み)')
      } else {
        await commitMatch(prep)
        console.log(`  ✓ DB書き込み完了 (${prep.queries.length} queries in 1 txn, new players=${prep.newPlayerCount})`)
      }
    }
  } else if (broadcastOnly) {
    // 一覧ページから放送情報だけ一括UPDATE（個別試合ページは取得しない）
    console.log(`Broadcast-only mode: comp_years=${compYears} comp_frame=${compFrameId}`)
    const rows = await fetchMatchListForSeason(compYears, compFrameId)
    console.log(`[list] ${rows.length} matches`)
    if (!apply) {
      const sample = rows.slice(0, 10).map(r => `${r.matchCardId} ${r.date} ${r.home} vs ${r.away} → ${r.broadcast ?? '(none)'}`).join('\n  ')
      console.log(`(dry-run) 先頭10件:\n  ${sample}`)
    } else {
      const queries = []
      let skipped = 0
      for (const r of rows) {
        if (!r.broadcast) { skipped++; continue }
        queries.push(sql`
          UPDATE fixtures SET broadcast_ja = ${r.broadcast}, updated_at = NOW()
          WHERE id = ${r.matchCardId}
        `)
      }
      // 1 トランザクションで全件UPDATE
      await sql.transaction(queries)
      // 実際に何件 DB に反映されたか件数カウント
      const c = await sql`
        SELECT COUNT(*)::int AS n FROM fixtures WHERE id = ANY(${rows.filter(r => r.broadcast).map(r => r.matchCardId)}) AND broadcast_ja IS NOT NULL
      `
      console.log(`\n=== 放送情報 UPDATE 完了: attempted=${queries.length} now_with_broadcast=${c[0].n} skipped_empty=${skipped} ===`)
      console.log(`  (attempted と now_with_broadcast の差は、DB に該当 fixture が無い試合)`)
    }
  } else if (roundsOnly) {
    // 一覧ページから round / round_number のみ一括UPDATE
    console.log(`Rounds-only mode: comp_years=${compYears} comp_frame=${compFrameId}`)
    const rows = await fetchMatchListForSeason(compYears, compFrameId)
    console.log(`[list] ${rows.length} matches`)
    if (!apply) {
      const sample = rows.slice(0, 10).map(r => `${r.matchCardId} ${r.date} ${r.home} vs ${r.away} → round="${r.round ?? '(none)'}" round_number=${r.roundNumber ?? 'null'}`).join('\n  ')
      console.log(`(dry-run) 先頭10件:\n  ${sample}`)
    } else {
      const queries = []
      let skipped = 0
      for (const r of rows) {
        if (!r.round) { skipped++; continue }
        // 既存値（API-FOOTBALL 由来等）を尊重する場合は COALESCE。
        // 本モードは「J.League表記で埋めたい」なので常に上書き。
        queries.push(sql`
          UPDATE fixtures SET round = ${r.round}, round_number = ${r.roundNumber ?? null}, stage_ja = ${r.stageJa ?? null}, updated_at = NOW()
          WHERE id = ${r.matchCardId}
        `)
      }
      await sql.transaction(queries)
      const ids = rows.filter(r => r.round).map(r => r.matchCardId)
      const c = await sql`
        SELECT COUNT(*)::int AS n FROM fixtures WHERE id = ANY(${ids}) AND round IS NOT NULL
      `
      console.log(`\n=== 節情報 UPDATE 完了: attempted=${queries.length} now_with_round=${c[0].n} skipped_empty=${skipped} ===`)
    }
  } else {
    console.log(`Batch mode: comp_years=${compYears} comp_frame=${compFrameId} limit=${limit === Infinity ? 'all' : limit} past-only=${pastOnly}`)
    const rows = await fetchMatchListForSeason(compYears, compFrameId)
    const completed = rows.filter(r => r.isCompleted).length
    const upcoming  = rows.length - completed
    console.log(`[list] ${rows.length} matches (完了:${completed} / 未完了:${upcoming})`)

    let filtered = pastOnly ? rows.filter(r => r.isCompleted) : rows

    // --recent N: 日付降順ソートして最新 N 件に絞る（定期実行用）
    if (recentN != null) {
      const n = Number(recentN)
      filtered = [...filtered].sort((a, b) => parseListDate(b.date) - parseListDate(a.date)).slice(0, n)
      console.log(`[list] --recent ${n}: 最新${filtered.length}試合に絞り込み`)
    }

    // --skip-done: 一括チェックで既処理分を除外
    //   (A) id = match_card_id の直接一致 (2017-2025 新規INSERT由来)
    //   (B) date + home_team + away_team の一致 (2026特別など既存API-FOOTBALL fixtureをUPDATEした場合)
    //   未開催試合 (status='NS') は 'j-league' でも完了後に再処理が必要なのでスキップ対象外
    if (skipDone && filtered.length > 0) {
      const teamMap = await loadTeamNameMap()
      const listDateToYmd = s => {
        const m = /^(\d{2})\/(\d{2})\/(\d{2})/.exec(s ?? '')
        return m ? `20${m[1]}-${m[2]}-${m[3]}` : null
      }
      const ids = filtered.map(r => r.matchCardId).filter(v => v != null)  // 未開催 (matchCardId=null) は除外
      const dates = [...new Set(filtered.map(r => listDateToYmd(r.date)).filter(Boolean))]
      const [byId, byDate] = await Promise.all([
        sql`SELECT id FROM fixtures WHERE id = ANY(${ids}) AND data_source = 'j-league' AND status IN ('FT','AET','PEN')`,
        dates.length > 0
          ? sql`SELECT TO_CHAR(date AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS d_jst, home_team_id, away_team_id FROM fixtures WHERE TO_CHAR(date AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') = ANY(${dates}) AND data_source = 'j-league' AND status IN ('FT','AET','PEN')`
          : Promise.resolve([])
      ])
      const doneIds = new Set(byId.map(r => r.id))
      const doneDTA = new Set(byDate.map(r => `${r.d_jst}:${r.home_team_id}:${r.away_team_id}`))
      const before = filtered.length
      filtered = filtered.filter(r => {
        if (r.matchCardId != null && doneIds.has(r.matchCardId)) return false
        const ymd = listDateToYmd(r.date)
        const hId = resolveTeamId(r.home, teamMap)
        const aId = resolveTeamId(r.away, teamMap)
        if (!ymd || !hId || !aId) return true  // 解決できない場合は通常処理へ
        return !doneDTA.has(`${ymd}:${hId}:${aId}`)
      })
      console.log(`[list] skip-done 一括チェック: ${before} → ${filtered.length} (${before - filtered.length}件スキップ)`)
    }
    console.log(`[list] 処理対象: ${filtered.length} 試合\n`)

    const targets = filtered.slice(0, limit)
    const stats = { ok: 0, err: 0, skipped: 0 }

    // パイプライン用状態
    //   - prevCommit: 直前試合のコミット Promise（裏で走らせ、次の試合の fetch と重ねる）
    //   - lastFetchStartAt: 直近の fetch 開始時刻。次の fetch はこれ + randDelay() まで待つ。
    //     これによりJ.Leagueへのリクエスト間隔は従来通り維持される。
    let prevCommit = null
    let prevMatchId = null
    let lastFetchStartAt = 0

    async function awaitPrevCommit() {
      if (!prevCommit) return
      const pending = prevCommit
      const pendingId = prevMatchId
      prevCommit = null
      prevMatchId = null
      try {
        await pending
        stats.ok++
        console.log(`  ✓ commit ok (match=${pendingId})`)
      } catch (err) {
        console.error(`  ✗ commit failed (match=${pendingId}): ${err.message}`)
        stats.err++
      }
    }

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i]
      try {
        // 未開催試合 (matchCardId なし) は詳細ページfetchせず、リスト行データだけで処理
        const isFuture = target.matchCardId == null

        if (!isFuture) {
          // J.League へのリクエスト間隔を維持（fetch 開始時刻ベース）
          if (lastFetchStartAt > 0) {
            const wait = lastFetchStartAt + randDelay() - Date.now()
            if (wait > 0) await sleep(wait)
          }
          lastFetchStartAt = Date.now()
        }

        // fetch + parse + 選手プリロード（前試合のDBコミットと並行）
        //   バッチモードでは既に一括 skip-done 済みなので prepareMatch 側の個別 SELECT は無効化
        const prep = isFuture
          ? await prepareFutureMatch(target, { apply, league: leagueId })
          : await prepareMatch(target.matchCardId, {
              apply, league: leagueId, skipDone: false,
              broadcast: target.broadcast,
              isCompleted: target.isCompleted ?? true,
            })

        if (prep.skipped) {
          console.log(`[match=${prep.matchCardId}] skip (already j-league)`)
          stats.skipped++
          // skipは fetch しないので間隔タイマーはリセット
          lastFetchStartAt = 0
          continue
        }
        for (const line of prep.logLines) console.log(line)

        // 次のコミットを投げる前に、前のコミットの完了を待つ
        await awaitPrevCommit()

        if (prep.dryRun) {
          console.log('  (dry-run, DB未書き込み)')
          stats.ok++
        } else {
          // 裏でコミット開始、戻らず次ループへ（次の fetch と並走）
          prevCommit = commitMatch(prep)
          prevMatchId = prep.matchCardId
        }
      } catch (err) {
        console.error(`  ✗ match=${target.matchCardId} error: ${err.message}`)
        stats.err++
      }
    }
    // 最後のコミットを待機
    await awaitPrevCommit()

    console.log(`\n=== 終了 ok=${stats.ok} skipped=${stats.skipped} err=${stats.err} ===`)
  }
} catch (err) {
  console.error('Fatal:', err)
  process.exit(1)
}
