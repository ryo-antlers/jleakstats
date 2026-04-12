import { readFileSync } from 'fs'
import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'

config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL)

const content = readFileSync('C:/Users/jackc/Desktop/jleakstats/csv/players_price.csv', 'utf-8')
const lines = content.trim().split('\n').slice(1) // ヘッダースキップ

let updated = 0
let skipped = 0

for (const line of lines) {
  const [player_id, , price] = line.split(',')
  const id = parseInt(player_id)
  const p = parseInt(price)

  if (!id || !p) { skipped++; continue }

  await sql`UPDATE players_master SET price = ${p} WHERE id = ${id}`
  updated++
}

console.log(`Done: ${updated} updated, ${skipped} skipped`)
