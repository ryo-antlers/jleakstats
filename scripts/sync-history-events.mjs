/**
 * 過去シーズンの得点イベントを一括取得
 * 使い方: node --env-file=.env.local scripts/sync-history-events.mjs 2025
 */

import { neon } from '@neondatabase/serverless'

const DATABASE_URL = process.env.DATABASE_URL
const API_KEY = process.env.API_FOOTBALL_KEY

if (!DATABASE_URL || !API_KEY) {
  console.error('❌ DATABASE_URL または API_FOOTBALL_KEY が見つかりません')
  console.error('   node --env-file=.env.local scripts/sync-history-events.mjs 2025')
  process.exit(1)
}

const season = parseInt(process.argv[2])
if (!season || season < 2020 || season > 2025) {
  console.error('❌ シーズンを指定してください（2020〜2025）')
  console.error('   node --env-file=.env.local scripts/sync-history-events.mjs 2025')
  process.exit(1)
}

const sql = neon(DATABASE_URL)

// 対象試合を取得（終了済みのみ）
const fixtures = await sql`
  SELECT id FROM fixtures
  WHERE season = ${season}
    AND league_id = 98
    AND status IN ('FT', 'AET', 'PEN')
  ORDER BY date ASC
`

console.log(`📋 ${season}シーズン: ${fixtures.length}試合 対象`)

// すでにイベントがある試合のIDセットを作成
const existing = await sql`
  SELECT DISTINCT fixture_id FROM fixture_events
  WHERE fixture_id IN (SELECT id FROM fixtures WHERE season = ${season} AND league_id = 98)
`
const existingIds = new Set(existing.map(r => r.fixture_id))

const targets = fixtures.filter(f => !existingIds.has(f.id))
console.log(`⚡ 未取得: ${targets.length}試合（${existingIds.size}試合はスキップ）`)

if (targets.length === 0) {
  console.log('✅ 全試合取得済みです')
  process.exit(0)
}

let done = 0, errors = 0

for (const { id } of targets) {
  try {
    const res = await fetch(`https://v3.football.api-sports.io/fixtures/events?fixture=${id}`, {
      headers: { 'x-apisports-key': API_KEY }
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    const events = (data.response ?? []).filter(e => e.type === 'Goal')

    for (const e of events) {
      await sql`
        INSERT INTO fixture_events
          (fixture_id, elapsed, team_id, player_id, player_name_en, assist_id, assist_name_en, type, detail)
        VALUES (
          ${id},
          ${e.time.elapsed ?? null},
          ${e.team.id ?? null},
          ${e.player?.id ?? null},
          ${e.player?.name ?? null},
          ${e.assist?.id ?? null},
          ${e.assist?.name ?? null},
          ${'Goal'},
          ${e.detail ?? null}
        )
      `
    }

    done++
    process.stdout.write(`\r進捗: ${done + errors}/${targets.length}  ✅${done} ❌${errors}`)
  } catch (err) {
    errors++
    console.error(`\n❌ fixture ${id}: ${err.message}`)
  }

  // レート制限対策（1秒あたり最大5リクエスト程度）
  await new Promise(r => setTimeout(r, 220))
}

console.log(`\n\n🎉 完了！ 成功:${done}試合  エラー:${errors}試合`)
