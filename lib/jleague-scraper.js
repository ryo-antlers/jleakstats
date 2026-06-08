// J.League 公式サイト (jleague.jp) のスクレイピングヘルパ
//
// 主な用途: 試合2時間前に公開される審判情報の取得
//   - 節別TOP `/match/j1/2026/` (or `/match/j2j3/2026/`) からは match_code (例: "050602") を抽出
//   - `/match/ajax_live.json?url=%2Fmatch%2F<league>%2F2026%2F<code>%2F` から審判情報を取得
//
// 審判が未公開の段階では、対応セルが空文字 / "-" / 空白のみで返る
// → 名前らしい文字列が入っている場合のみ保存する idempotent 設計を想定

import * as cheerio from 'cheerio'
import { SEASON } from './season.js'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// DB 上の league_id → jleague.jp 上の URL パスセグメント
//   J1: 98 → "j1"
//   J2/J3百年構想: 2 → "j2j3"
export function dbLeagueToJleaguePath(dbLeague) {
  if (dbLeague === 98) return 'j1'
  if (dbLeague === 2) return 'j2j3'
  throw new Error(`Unknown DB league_id: ${dbLeague}`)
}

// 節別TOP HTML を取得し、各試合カードから (match_code, テキスト) を抽出
// テキストには時刻・スタジアム略称・チーム名 (短縮) が含まれる
// 戻り値: [{ code, text }, ...]
export async function fetchRoundListing(jleaguePath) {
  const url = `https://www.jleague.jp/match/${jleaguePath}/${SEASON}/`
  const r = await fetch(url, {
    headers: { 'user-agent': UA },
    redirect: 'follow',
  })
  if (!r.ok) throw new Error(`fetchRoundListing ${url} -> ${r.status}`)
  const html = await r.text()
  const $ = cheerio.load(html)

  const seen = new Map() // code -> text
  $(`a[href*="/match/${jleaguePath}/${SEASON}/"]`).each((_, a) => {
    const href = $(a).attr('href')
    const m = href?.match(new RegExp(`/match/${jleaguePath}/${SEASON}/(\\d{6})/`))
    if (!m) return
    const code = m[1]
    if (seen.has(code)) return
    // 試合カード親要素のテキスト (時刻・チーム名等が含まれる)
    const card = $(a).closest('section, div, article, li, tr')
    const text = card.text().replace(/\s+/g, ' ').trim().slice(0, 400)
    seen.set(code, text)
  })
  return [...seen.entries()].map(([code, text]) => ({ code, text }))
}

// ajax_live.json の HTML フラグメントを取得
// 戻り値: HTML 文字列 (空かどうかは呼び出し側で判定)
export async function fetchAjaxLiveHtml(jleaguePath, matchCode) {
  const targetPath = `/match/${jleaguePath}/${SEASON}/${matchCode}/`
  const url = `https://www.jleague.jp/match/ajax_live.json?url=${encodeURIComponent(targetPath)}`
  const r = await fetch(url, {
    headers: {
      'user-agent': UA,
      'x-requested-with': 'XMLHttpRequest',
      'accept': 'application/json, text/javascript, */*; q=0.01',
      'referer': `https://www.jleague.jp${targetPath}live/`,
    },
  })
  if (!r.ok) throw new Error(`fetchAjaxLiveHtml ${url} -> ${r.status}`)
  return r.text()
}

// HTMLフラグメントから審判情報を抽出
// レスポンス形式:
//   <td class="bgGray">主審</td><td>飯田　淳平</td>
//   <td class="bgGray">副審</td><td>西橋　勲、浜本　祐介</td>
//   <td class="bgGray">第4の審判員</td><td>堀　善仁</td>
//   <td class="bgGray">VAR</td><td>福島　孝一郎</td>
//   <td class="bgGray">AVAR</td><td>小泉　朝香</td>
//
// 試合前 (まだ未発表) の場合: 各セルが空文字 or "-" or 空白のみ → null 扱い
// 戻り値: { main, ar1_2, fourth, var: ..., avar } の dict (見つからない/空のキーは除外)
export function parseRefereesFromHtml(html) {
  if (!html || html.length === 0) return {}
  const $ = cheerio.load(html)
  const labelMap = {
    '主審': 'main',
    '副審': 'assistants',
    '第4の審判員': 'fourth',
    'VAR': 'var',
    'AVAR': 'avar',
  }

  const result = {}
  $('td.bgGray').each((_, td) => {
    const label = $(td).text().trim()
    const key = labelMap[label]
    if (!key) return
    const next = $(td).next('td').text().replace(/\s+/g, ' ').trim()
    if (!next || next === '-' || next === '−') return // 未公開
    result[key] = next
  })
  return result
}

// 全角英数字 → 半角に正規化 (川崎Ｆ → 川崎F, Ｇ大阪 → G大阪 など)
function normalizeText(s) {
  return String(s ?? '').normalize('NFKC')
}

// match_code "MMDDXX" から月日 "MMDD" を抽出
function codeToMonthDay(code) {
  return String(code ?? '').slice(0, 4)
}

// Date | string → "MMDD" (Asia/Tokyo)
function dateToMonthDay(d) {
  if (!d) return null
  const dt = typeof d === 'string' ? new Date(d) : d
  // 試合日は JST で考えるべき (キックオフが日付境界をまたぐ可能性)
  const jst = new Date(dt.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const mm = String(jst.getMonth() + 1).padStart(2, '0')
  const dd = String(jst.getDate()).padStart(2, '0')
  return `${mm}${dd}`
}

// 「ホーム vs アウェイ」と match_code 群を突合し、(fixture_id) → match_code を返す
// 一覧テキストは "鹿島" "横浜FM" のような略称で含まれるため、teams_master.short_name で照合する
// 公式は全角混じり (Ｆ Ｖ Ｇ) なので NFKC 正規化してから includes 判定
// 親要素のテキスト範囲が広すぎる場合があるため、code 先頭4桁 (MMDD) と DBの試合日が一致するもののみマッチ
//   listing: [{ code, text }, ...]
//   pairs: [{ fixture_id, home_short, away_short, date }, ...]
// 戻り値: Map(fixture_id, code)
export function matchListingToFixtures(listing, pairs) {
  const out = new Map()
  const normListing = listing.map(({ code, text }) => ({
    code,
    text: normalizeText(text),
    monthDay: codeToMonthDay(code),
  }))
  for (const p of pairs) {
    if (!p.home_short || !p.away_short) continue
    const home = normalizeText(p.home_short)
    const away = normalizeText(p.away_short)
    const targetMD = dateToMonthDay(p.date)
    const candidates = targetMD
      ? normListing.filter(l => l.monthDay === targetMD)
      : normListing
    const hit = candidates.find(({ text }) => text.includes(home) && text.includes(away))
    if (hit) out.set(p.fixture_id, hit.code)
  }
  return out
}
