// マリノス太郎にテスト採点データを投入
//   - 横浜FM (team_id=296) の直近 5 試合
//   - 各試合のスタメン (lineup) からランダムに 5-10 選手を採点
//   - スコアは 5.0〜8.5 のランダム (gauss風に偏らせる)
import 'dotenv/config'
import dotenv from 'dotenv'
dotenv.config({ path: '/Users/ryo/Desktop/jleakstats/.env.local' })
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

const USER_ID = 'user_test_marinos01'
const TEAM_ID = 296 // 横浜FM
const FIXTURE_IDS = [1504811, 1504803, 1504796, 1504782, 1504772]

// 6.0-8.0 中心の正規分布もどき
function randScore() {
  // 6.5 ± 1.0 ぐらい
  const r = (Math.random() + Math.random()) / 2 // triangular distribution
  const score = 5.5 + r * 3
  return Math.round(score * 10) / 10 // 0.1 刻み
}

// 既存テストデータ削除
console.log('=== 既存テスト採点を削除 ===')
const delResult = await sql`DELETE FROM ratings WHERE clerk_user_id = ${USER_ID}`
console.log('  削除完了')

let totalInserted = 0
for (const fixtureId of FIXTURE_IDS) {
  // この試合の マリノス側スタメン
  const lineup = await sql`
    SELECT fl.player_id, pm.name_ja
    FROM fixture_lineups fl
    JOIN players_master pm ON pm.id = fl.player_id
    WHERE fl.fixture_id = ${fixtureId} AND fl.team_id = ${TEAM_ID}
  `
  if (lineup.length === 0) {
    console.log(`fixture ${fixtureId}: スタメンなし、スキップ`)
    continue
  }

  // ランダムに 7-12 選手を選んで採点
  const n = Math.min(lineup.length, 7 + Math.floor(Math.random() * 6))
  const shuffled = [...lineup].sort(() => Math.random() - 0.5).slice(0, n)

  for (const p of shuffled) {
    const score = randScore()
    await sql`
      INSERT INTO ratings (clerk_user_id, fixture_id, player_id, score, skipped, created_at, updated_at)
      VALUES (${USER_ID}, ${fixtureId}, ${p.player_id}, ${score}, false, NOW(), NOW())
      ON CONFLICT (clerk_user_id, fixture_id, player_id) DO UPDATE
        SET score = EXCLUDED.score, updated_at = NOW()
    `
    totalInserted++
  }
  console.log(`  fixture ${fixtureId}: ${n} 選手採点`)
}

console.log(`\n完了: ${totalInserted} 件の採点を投入`)

// 結果サマリー
const [r] = await sql`SELECT COUNT(*)::int AS count, AVG(score)::float AS avg FROM ratings WHERE clerk_user_id = ${USER_ID}`
console.log(`サマリー: ${r.count}件, 平均 ${r.avg.toFixed(2)}`)
