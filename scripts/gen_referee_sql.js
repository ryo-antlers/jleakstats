const fs = require('fs')

const csvPath = 'C:/Users/jackc/Downloads/polished-butterfly-49216279_production_neondb_2026-03-30_16-19-17.csv'
const outPath = 'C:/Users/jackc/Desktop/jleakstats/sql/update_referee_names.sql'

const content = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '') // BOM除去
const lines = content.split(/\r?\n/).filter(l => l.trim())

const sql = ['BEGIN;\n']
const seen = new Set()

for (let i = 1; i < lines.length; i++) {
  // CSVパース（ダブルクォート対応）
  const match = lines[i].match(/^"?([^"]+)"?,(.+)$/)
  if (!match) continue
  const nameEn = match[1].trim()
  const nameJa = match[2].trim()
  if (nameEn && nameJa && !seen.has(nameEn)) {
    seen.add(nameEn)
    const escaped = nameJa.replace(/'/g, "''")
    sql.push(`UPDATE fixtures SET referee_ja = '${escaped}' WHERE referee_en = '${nameEn.replace(/'/g, "''")}';`)
  }
}

sql.push('\nCOMMIT;')
fs.writeFileSync(outPath, sql.join('\n'), 'utf-8')
console.log(`生成完了: ${seen.size}件`)
