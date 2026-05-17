// J.League Data Site フルスクレイパー (ライブラリ)
//
// scripts/scrape-jleague-full.mjs (CLI) と app/api/sync/jleague-official (cron API) の両方から利用。
// 試合詳細ページ https://data.j-league.or.jp/SFMS02/?match_card_id=<id> を fetch + parse して
// fixtures / fixture_lineups / fixture_events / players_master / player_aliases を書き込む。
//
// 共通設計:
//   - sql は lib/db.js を直接使う (env は呼び出し側で事前ロード必須)
//   - キャッシュ変数 (teamNameToId, aliasByNormCache, playerByIdCache, ...) はモジュールスコープ
//     Vercel Functions の warm start で再利用される可能性があるため、API 側は invocation 毎に
//     clearCaches() を呼んで stale を防ぐ

import * as cheerio from 'cheerio'
import sql from './db.js'

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
  'Accept-Encoding': 'gzip, deflate, br',
  'DNT': '1',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
}

// ─── ユーティリティ ─────────────────────────────
export function clean(s) {
  if (s == null) return null
  return String(s).replace(/[　\s]+/g, ' ').trim() || null
}
export function parseIntOrNull(s) {
  if (!s) return null
  const m = String(s).replace(/,/g, '').match(/-?\d+/)
  return m ? parseInt(m[0], 10) : null
}
export function parseFloatOrNull(s) {
  if (!s) return null
  const m = String(s).match(/-?\d+(\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}
export function parseMinuteBase(s) {
  if (!s) return null
  const m = String(s).match(/^(\d+)/)
  return m ? parseInt(m[1], 10) : null
}
export function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
// 一覧ページの日付文字列 "YY/MM/DD(dow)" → YYYYMMDD 数値（比較用、パース失敗時 0）
export function parseListDate(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})/.exec(s ?? '')
  return m ? parseInt(`20${m[1]}${m[2]}${m[3]}`, 10) : 0
}
// "第１節第１日" / "第1節" → 1。決勝・準々決勝などリーグ戦以外は null
export function parseRoundNumber(s) {
  if (!s) return null
  const n = s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  const m = /第(\d+)節/.exec(n)
  return m ? parseInt(m[1], 10) : null
}

// 過去シーズンの旧名義 → 現行 teams_master の表記 へのエイリアス
//   同一クラブの改名のみ（消滅/分裂した別クラブは teams_master に別レコードとして登録）
const TEAM_NAME_ALIASES = new Map([
  ['コンサドーレ札幌', '北海道コンサドーレ札幌'],   // 〜2015 → 2016〜
  ['名古屋グランパスエイト', '名古屋グランパス'],    // 〜2007 → 2008〜
  ['ヴェルディ川崎', '東京ヴェルディ'],              // 〜2000 → 2001〜（東京移転）
  ['読売ヴェルディ', '東京ヴェルディ'],              // 1993 J1発足時の名称
  ['東京ヴェルディ1969', '東京ヴェルディ'],          // 2001〜2008（創立年併記期）※全角数字はnormalizeで半角化済み
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
export function normalizeTeamName(s) {
  if (!s) return ''
  const n = s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, c =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  ).replace(/．/g, '.')      // 全角ピリオド → 半角 (Y.S.C.C.横浜 等)
   .replace(/－/g, '-')      // 全角ハイフンマイナス → 半角 (U-23 等)
   .replace(/\s+/g, '')
  return TEAM_NAME_ALIASES.get(n) ?? n
}
// "2025/02/14" + "19:03" → Date (JST)
export function toIsoDate(dateStr, timeStr) {
  if (!dateStr) return null
  const d = dateStr.replace(/\//g, '-')
  const t = timeStr ? timeStr : '00:00'
  return `${d}T${t}:00+09:00`
}
// 一覧行の "26/05/02(土)" + "14:00" → ISO datetime
export function listDateToIso(listDate, kickoff) {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})/.exec(listDate ?? '')
  if (!m) return null
  const yyyy = `20${m[1]}`
  const t = (kickoff && /^\d{1,2}:\d{2}/.test(kickoff)) ? kickoff.padStart(5, '0').slice(0, 5) : '00:00'
  return `${yyyy}-${m[2]}-${m[3]}T${t}:00+09:00`
}

export async function fetchText(url) {
  const res = await fetch(url, { headers: BROWSER_HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${url}`)
  return res.text()
}

// ─── Parser ─────────────────────────────────────
export function parseMatchPage(html) {
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
export async function loadTeamNameMap() {
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

export function resolveTeamId(name, map) {
  if (!name) return null
  const key = normalizeTeamName(name)
  return map.get(key) ?? null
}

// canonical-aware 選手ID解決のキャッシュ (セッション全体で共有)
// 10000000+ 新規 canonical ID のカウンタ
let nextCustomPlayerId = null
export async function ensurePlayerIdCounter() {
  if (nextCustomPlayerId != null) return
  // 既存 9M+ + 10M+ どちらの最大値より大きい値から採番 (canonical model 統一のため 10M+ レンジ)
  const maxRes = await sql`
    SELECT GREATEST(
      COALESCE((SELECT MAX(id) FROM players_master WHERE id >= 10000000), 9999999),
      COALESCE((SELECT MAX(id) FROM players_master WHERE id >= 9000000 AND id < 10000000), 9999999)
    ) AS max_id
  `
  nextCustomPlayerId = Number(maxRes[0].max_id) + 1
}

// player_aliases から normalized → Set<canonical_id> マップを構築
let aliasByNormCache = null
export async function loadAliasByNorm() {
  if (aliasByNormCache) return aliasByNormCache
  const rows = await sql`SELECT canonical_id, normalized FROM player_aliases`
  aliasByNormCache = new Map()
  for (const r of rows) {
    if (!aliasByNormCache.has(r.normalized)) aliasByNormCache.set(r.normalized, new Set())
    aliasByNormCache.get(r.normalized).add(r.canonical_id)
  }
  return aliasByNormCache
}

// players_master から id → row のマップを構築 (canonical 解決とチーム/ポジション絞込み用)
let playerByIdCache = null
export async function loadPlayerById() {
  if (playerByIdCache) return playerByIdCache
  const rows = await sql`SELECT id, name_ja, team_id, position, canonical_id FROM players_master`
  playerByIdCache = new Map(rows.map(r => [r.id, r]))
  return playerByIdCache
}

// 名前正規化 (NFKC + 空白/中黒除去 + 小文字化)
export function normalizePlayerName(s) {
  if (!s) return null
  return s.normalize('NFKC').replace(/[\s　・]+/g, '').toLowerCase()
}

// パイプライン実行中、直前の試合で割当てた選手の name → canonical_id を共有
// (DB未コミットでもセッション内で参照できる)
const recentlyAllocatedPlayers = new Map()  // normalized → canonical_id

// Vercel Functions の warm start 対策: API ルートが各 invocation で呼ぶ
export function clearCaches() {
  teamNameToId = null
  aliasByNormCache = null
  playerByIdCache = null
  nextCustomPlayerId = null
  recentlyAllocatedPlayers.clear()
}

// ─── 試合データを準備（fetch + parse + クエリ構築、DB書き込みは行わない）────
export async function prepareMatch(matchCardId, { apply, league, skipDone, broadcast, isCompleted = true }) {
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

  // canonical-aware キャッシュをロード (起動時1回)
  await ensurePlayerIdCounter()
  const aliasByNorm = await loadAliasByNorm()  // normalized → Set<canonical_id>
  const playerById = await loadPlayerById()    // id → row

  // 選手解決: 同名でも canonical で正確に分離、移籍時の重複も防止
  // 戻り値は canonical_id (alias の生IDではなく)
  const newPlayerRows = []  // { canonical_id, name, teamId, pos } - 新規 canonical 作成分
  function resolvePlayer(name, teamId, pos) {
    if (!name || !teamId) return null
    const norm = normalizePlayerName(name)
    if (!norm) return null

    // ① alias テーブルから候補 canonical 取得
    //    候補は alias の canonical_id だが、後で merge されてる可能性があるので再 canonicalize
    const aliasMatches = [...(aliasByNorm.get(norm) ?? new Set())]
    const toCanonical = (id) => playerById.get(id)?.canonical_id ?? id
    const candidateCanonicals = [...new Set(aliasMatches.map(toCanonical))]

    // ② チーム履歴で絞り込み: alias行の team_id or canonical の team_id が一致
    const teamMatched = candidateCanonicals.filter(canonical => {
      // canonical 行自身が同チーム
      if (playerById.get(canonical)?.team_id === teamId) return true
      // canonical に紐づく alias 行のいずれかが同チーム
      return aliasMatches.some(aid => {
        const pm = playerById.get(aid)
        return pm && toCanonical(aid) === canonical && pm.team_id === teamId
      })
    })

    if (teamMatched.length === 1) return teamMatched[0]

    // ③ team で複数 or 0件 → position で絞り込み (利用可能なら)
    if (teamMatched.length > 1 && pos) {
      const posMatched = teamMatched.filter(c => playerById.get(c)?.position === pos)
      if (posMatched.length === 1) return posMatched[0]
    }

    // ④ team match 0件で name 単独一致 → 移籍してきた可能性 (前所属の canonical 再利用)
    if (teamMatched.length === 0 && candidateCanonicals.length === 1) {
      return candidateCanonicals[0]
    }

    // ⑤ team match 0件で複数 + position 絞込み (移籍 + 同姓同名)
    if (teamMatched.length === 0 && candidateCanonicals.length > 1 && pos) {
      const posMatched = candidateCanonicals.filter(c => playerById.get(c)?.position === pos)
      if (posMatched.length === 1) return posMatched[0]
    }

    // ⑥ パイプライン直前 (DB未コミット) で同名を割り当てた canonical があるか
    if (recentlyAllocatedPlayers.has(norm)) {
      return recentlyAllocatedPlayers.get(norm)
    }

    // ⑦ 完全に新規 → 10000000+ 新規 canonical 採番
    //    players_master + player_aliases にも登録 (次回マッチで使えるように)
    const newId = nextCustomPlayerId++
    newPlayerRows.push({ id: newId, name, teamId, pos, normalized: norm })
    // ローカルキャッシュにも反映 (このセッションで以降の resolve に効く)
    playerById.set(newId, { id: newId, name_ja: name, team_id: teamId, position: pos, canonical_id: null })
    if (!aliasByNorm.has(norm)) aliasByNorm.set(norm, new Set())
    aliasByNorm.get(norm).add(newId)
    recentlyAllocatedPlayers.set(norm, newId)
    return newId
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
  // canonical-aware: players_master + player_aliases 両方に登録
  const playerInserts = []
  for (const p of newPlayerRows) {
    playerInserts.push(sql`
      INSERT INTO players_master (id, name_ja, team_id, position, updated_at)
      VALUES (${p.id}, ${p.name}, ${p.teamId}, ${p.pos ?? null}, NOW())
      ON CONFLICT (id) DO NOTHING
    `)
    // alias も同時登録 (次回スクレイプで同名にヒットさせるため)
    playerInserts.push(sql`
      INSERT INTO player_aliases (canonical_id, name_ja, normalized, source)
      VALUES (${p.id}, ${p.name}, ${p.normalized}, 'jleague-scraper')
      ON CONFLICT (canonical_id, normalized) DO NOTHING
    `)
  }
  const allQueries = [...playerInserts, ...queries]

  return { matchCardId, fixtureId, logLines, queries: allQueries, newPlayerCount: newPlayerRows.length }
}

// ─── 未開催試合準備 (詳細ページfetchせず、リスト行データだけで INSERT/UPDATE) ────
export async function prepareFutureMatch(target, { apply, league }) {
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

export async function commitMatch(prep) {
  await sql.transaction(prep.queries)
}

// 未開催試合用 synthetic ID 生成 (date + homeId からデターミニスティック)
//   formula: (season-2020)*1e8 + monthDay*1e4 + (homeId mod 10000)
//   for 2026-05-03 home=290 → 6*1e8 + 503*1e4 + 290 = 605030290 (INT4内に収まる)
export function syntheticFutureId(year, month, day, homeId) {
  return (year - 2020) * 100_000_000 + (month * 100 + day) * 10_000 + (homeId % 10_000)
}

// ─── 試合一覧取得 ────────────────────────────────
export async function fetchMatchListForSeason(yearsParam, frameIdParam) {
  const params = new URLSearchParams({
    competition_years: String(yearsParam),
    competition_frame_ids: String(frameIdParam),
    tv_relay_station_name: '',  // ← これを付けると未開催試合も同じリストに含まれる
  })
  const url = `https://data.j-league.or.jp/SFMS01/search?${params.toString()}`
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
      ? stageRaw.replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ').trim() || null
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
