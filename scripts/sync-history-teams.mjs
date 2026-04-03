/**
 * 過去シーズンのチーム名をteams_masterに追加（group_name=NULLで登録）
 * 使い方: node --env-file=.env.local scripts/sync-history-teams.mjs 2025
 */

import { neon } from '@neondatabase/serverless'

const DATABASE_URL = process.env.DATABASE_URL
const API_KEY = process.env.API_FOOTBALL_KEY

if (!DATABASE_URL || !API_KEY) {
  console.error('❌ DATABASE_URL または API_FOOTBALL_KEY が見つかりません')
  process.exit(1)
}

const season = parseInt(process.argv[2])
if (!season || season < 2020 || season > 2025) {
  console.error('❌ シーズンを指定してください（2020〜2025）')
  process.exit(1)
}

const sql = neon(DATABASE_URL)

// そのシーズンの試合に登場するがteams_masterにないチームIDを取得
const missing = await sql`
  SELECT DISTINCT team_id FROM (
    SELECT home_team_id AS team_id FROM fixtures WHERE season = ${season} AND league_id = 98
    UNION
    SELECT away_team_id AS team_id FROM fixtures WHERE season = ${season} AND league_id = 98
  ) t
  WHERE team_id NOT IN (SELECT id FROM teams_master)
`

if (missing.length === 0) {
  console.log('✅ 未登録チームはありません')
  process.exit(0)
}

console.log(`📋 未登録チーム: ${missing.length}件 → API取得開始`)

let done = 0

for (const { team_id } of missing) {
  try {
    const res = await fetch(`https://v3.football.api-sports.io/teams?id=${team_id}`, {
      headers: { 'x-apisports-key': API_KEY }
    })
    const data = await res.json()
    const team = data.response?.[0]?.team
    if (!team) { console.log(`  ⚠️  ID ${team_id}: データなし`); continue }

    await sql`
      INSERT INTO teams_master (id, name_en, name_ja, short_name, color_primary, color_secondary, group_name)
      VALUES (${team.id}, ${team.name}, ${team.name}, ${team.name}, NULL, NULL, NULL)
      ON CONFLICT (id) DO NOTHING
    `
    console.log(`  ✅ ${team.id}: ${team.name}`)
    done++
  } catch (err) {
    console.error(`  ❌ ID ${team_id}: ${err.message}`)
  }

  await new Promise(r => setTimeout(r, 300))
}

console.log(`\n🎉 完了！ ${done}チーム追加`)
