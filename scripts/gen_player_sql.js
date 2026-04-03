const fs = require('fs')

const csvPath = 'C:/Users/jackc/Downloads/無題のスプレッドシート - シート1.csv'
const outPath = 'C:/Users/jackc/Desktop/jleakstats/sql/player_names_ja.sql'

const content = fs.readFileSync(csvPath, 'utf-8')
const lines = content.split(/\r?\n/).filter(l => l.trim())

const sql = ['BEGIN;\n']
const seen = new Set()

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(',')
  const id = cols[0]?.trim()
  const nameJp = cols[4]?.trim()
  if (id && nameJp && !seen.has(id)) {
    seen.add(id)
    const escaped = nameJp.replace(/'/g, "''")
    sql.push(`UPDATE players_master SET name_ja = '${escaped}' WHERE id = ${id};`)
  }
}

sql.push('\nCOMMIT;')
fs.writeFileSync(outPath, sql.join('\n'), 'utf-8')
console.log(`生成完了: ${seen.size}件`)
