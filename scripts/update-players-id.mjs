import { readFileSync } from 'fs'
import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'

config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL)

const csvPath = process.argv[2]
if (!csvPath) {
  console.error('Usage: node scripts/update-players-id.mjs <csv-path>')
  process.exit(1)
}

const content = readFileSync(csvPath, 'utf-8')
const lines = content.trim().split('\n')

let updated = 0
let notFound = 0

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(',')
  const name_ja = cols[0]?.trim()
  const jleague_id = cols[1]?.trim() || null
  const no = cols[2]?.trim() || null

  if (!name_ja) continue

  const result = await sql`
    UPDATE players_master
    SET jleague_id = ${jleague_id}, no = ${no ? parseInt(no) : null}
    WHERE name_ja = ${name_ja}
    RETURNING id, name_ja
  `

  if (result.length > 0) {
    console.log(`✓ ${name_ja} → jleague_id:${jleague_id}, no:${no}`)
    updated++
  } else {
    console.log(`✗ Not found: ${name_ja}`)
    notFound++
  }
}

console.log(`\nDone: ${updated} updated, ${notFound} not found`)
