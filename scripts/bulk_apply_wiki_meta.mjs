// JLSP 結果ページのクラブ説明文 / マスコット説明文を Wikipedia (ja) の
// extract で一括上書きするスクリプト。
//
// 実行:
//   node --env-file=.env.local scripts/bulk_apply_wiki_meta.mjs --dry
//   node --env-file=.env.local scripts/bulk_apply_wiki_meta.mjs --apply
//
// 戦略:
//   1. jlsp の CLUBS と CLUB_META を import (同モノレポじゃないので fs 直読み)
//   2. 各クラブで:
//      - club.name で Wiki extract を取り description_long とする
//      - (mascot.wikiTitle ?? mascot.name) で Wiki extract を取り mascot_description とする
//   3. extract が取れたフィールドだけ upsert (取れなかったフィールドは null = static fallback)

import fs from 'node:fs'
import path from 'node:path'
import { Pool } from '@neondatabase/serverless'

const APPLY = process.argv.includes('--apply')

// jlsp 側の club-meta.js を読み込む (parse は単純な eval で済むよう ESM のまま import)
const JLSP_DIR = '/Users/ryo/Desktop/jlsp'
const clubsJsPath = path.join(JLSP_DIR, 'lib/jlsp/clubs.js')
const clubMetaJsPath = path.join(JLSP_DIR, 'lib/jlsp/club-meta.js')

// dynamic import via file:// URL
const clubsMod = await import(`file://${clubsJsPath}`)
const clubMetaMod = await import(`file://${clubMetaJsPath}`)
const CLUBS = clubsMod.CLUBS
const CLUB_META = clubMetaMod.CLUB_META

// ─── Wiki fetcher (jlsp/lib/jlsp/wiki-image.js のロジックを単純化して再実装) ───
async function summary(title) {
  if (!title) return null
  try {
    const r = await fetch(
      `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { headers: { 'User-Agent': 'JLSP/1.0 (bulk-apply)' } },
    )
    if (!r.ok) return null
    const j = await r.json()
    if (j.type === 'disambiguation') return null
    return { extract: j.extract ?? null, title: j.title }
  } catch {
    return null
  }
}

async function getWikiExtract(title) {
  if (!title) return null
  // candidates: 本体 → 「・」分割の先頭 → 末尾「くん/ちゃん/ファミリー」除去
  const candidates = new Set([title])
  for (const ch of ['・', '&', 'と', '＆']) {
    if (title.includes(ch)) candidates.add(title.split(ch)[0].trim())
  }
  const trimmed = title.replace(/(くん|ちゃん|さん|ファミリー)$/u, '').trim()
  if (trimmed && trimmed !== title) candidates.add(trimmed)
  for (const c of candidates) {
    const r = await summary(c)
    if (r?.extract) return r.extract
  }
  return null
}

// ─── 本体 ───
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

console.log(`=== Wiki 一括反映 ${APPLY ? 'APPLY' : 'DRY-RUN'} ===`)
console.log(`対象: ${CLUBS.length} クラブ\n`)

const results = []
for (const c of CLUBS) {
  const meta = CLUB_META[c.id] ?? {}
  const mascot = meta.mascot
  process.stdout.write(`  [${c.id.padEnd(12)}] ${c.name.padEnd(20)}`)
  const clubExtract = await getWikiExtract(c.name)
  await sleep(150)
  const mascotExtract = mascot
    ? await getWikiExtract(mascot.wikiTitle ?? mascot.name)
    : null
  await sleep(150)
  results.push({ id: c.id, clubExtract, mascotExtract, mascotName: mascot?.name })
  const cFlag = clubExtract ? '✅club' : '   '
  const mFlag = mascotExtract ? '✅mascot' : (mascot ? '   mascot' : '   no-mascot')
  console.log(`  ${cFlag} | ${mFlag}`)
}

const clubsWithBoth = results.filter((r) => r.clubExtract && r.mascotExtract).length
const clubsWithEither = results.filter((r) => r.clubExtract || r.mascotExtract).length
console.log(`\n両方取れた: ${clubsWithBoth}, 片方以上取れた: ${clubsWithEither}, 何も取れず: ${CLUBS.length - clubsWithEither}\n`)

if (!APPLY) {
  console.log('(--apply を付けると DB へ upsert します)')
  await pool.end()
  process.exit(0)
}

console.log('=== APPLY ===')
let upserted = 0
for (const r of results) {
  if (!r.clubExtract && !r.mascotExtract) continue
  await pool.query(
    `INSERT INTO club_meta_overrides
       (club_id, description_long, mascot_description, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (club_id) DO UPDATE SET
       description_long   = COALESCE(EXCLUDED.description_long, club_meta_overrides.description_long),
       mascot_description = COALESCE(EXCLUDED.mascot_description, club_meta_overrides.mascot_description),
       updated_at         = NOW()`,
    [r.id, r.clubExtract ?? null, r.mascotExtract ?? null],
  )
  upserted += 1
}
console.log(`✅ upsert: ${upserted} 行`)

await pool.end()

function sleep(ms) { return new Promise((res) => setTimeout(res, ms)) }
