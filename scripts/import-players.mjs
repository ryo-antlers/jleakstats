import { readFileSync } from 'fs'
import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'

config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL)

const csvPath = process.argv[2]
if (!csvPath) {
  console.error('Usage: node scripts/import-players.mjs <csv-path>')
  process.exit(1)
}

const content = readFileSync(csvPath, 'utf-8')
const lines = content.trim().split('\n')
const headers = lines[0].split(',')

console.log('Headers:', headers)
console.log(`Total rows: ${lines.length - 1}`)

let inserted = 0
let skipped = 0

for (let i = 1; i < lines.length; i++) {
  // CSVの行をパース（カンマ区切り、引用符考慮）
  const row = lines[i].split(',')
  const id = parseInt(row[0])
  const name_en = row[1]?.trim()
  const name_ja = row[2]?.trim()
  const team_id = parseInt(row[3])
  const position = row[4]?.trim()
  const dob_raw = row[5]?.trim()
  const size_raw = row[6]?.trim()
  const name_kana = row[7]?.trim()

  // dobをYYYY-MM-DD形式に変換
  let dob = null
  if (dob_raw) {
    const parts = dob_raw.split('/')
    if (parts.length === 3) {
      dob = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
    }
  }

  const size = size_raw || null

  if (!id || !name_en || !position || !team_id) {
    console.log(`Skip row ${i}: missing required fields`)
    skipped++
    continue
  }

  try {
    await sql`
      INSERT INTO players_master (id, name_en, name_ja, name_kana, team_id, position, dob, size, price)
      VALUES (${id}, ${name_en}, ${name_ja}, ${name_kana}, ${team_id}, ${position}, ${dob}, ${size}, 3000)
      ON CONFLICT (id) DO UPDATE SET
        name_ja = EXCLUDED.name_ja,
        name_kana = EXCLUDED.name_kana,
        dob = COALESCE(EXCLUDED.dob, players_master.dob),
        size = COALESCE(EXCLUDED.size, players_master.size)
    `
    console.log(`✓ ${name_en} (${position}, team:${team_id})`)
    inserted++
  } catch (err) {
    console.error(`✗ ${name_en}: ${err.message}`)
    skipped++
  }
}

console.log(`\nDone: ${inserted} inserted/updated, ${skipped} skipped`)
