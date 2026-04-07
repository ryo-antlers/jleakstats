import sql from '@/lib/db'

// テーブル作成
async function ensureTables() {
  await sql`DROP TABLE IF EXISTS fantasy_gameweek_fixtures`
  await sql`DROP TABLE IF EXISTS fantasy_gameweeks`
  await sql`
    CREATE TABLE fantasy_gameweeks (
      id SERIAL PRIMARY KEY,
      gw_number INTEGER UNIQUE,
      start_date TEXT,
      end_date TEXT,
      status TEXT DEFAULT 'upcoming'
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS fantasy_gameweek_fixtures (
      gameweek_id INTEGER REFERENCES fantasy_gameweeks(id) ON DELETE CASCADE,
      fixture_id INTEGER,
      PRIMARY KEY (gameweek_id, fixture_id)
    )
  `
}

// UTC日時 → JST日付文字列 (YYYY-MM-DD)
function toJSTDate(date) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().slice(0, 10)
}

// 日付文字列 → 曜日 (0=Sun, 1=Mon, ... 5=Fri, 6=Sat)
function getDow(dateStr) {
  return new Date(dateStr + 'T00:00:00Z').getDay()
}

// 自動GW生成ロジック
function buildGameweeks(fixtures) {
  // 日付ごとにグループ化（JST基準）
  const byDate = {}
  for (const f of fixtures) {
    const d = toJSTDate(new Date(f.date))
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(f)
  }

  const sortedDates = Object.keys(byDate).sort()

  // 「アンカー日」を特定：金/土/日 は常時、水曜は7試合以上のみ
  const anchorDates = sortedDates.filter(d => {
    const dow = getDow(d)
    const count = byDate[d].length
    if (dow === 5 || dow === 6 || dow === 0) return true // Fri/Sat/Sun
    if (dow === 3 && count >= 7) return true // Wed 7+
    return false
  })

  // アンカー日をブロックにまとめる
  // 水曜（7試合以上）は常に独立ブロック
  // 金/土/日は3日以内なら同じブロック
  const blocks = []
  let current = null
  for (const d of anchorDates) {
    const dow = getDow(d)
    const isWed = dow === 3
    if (!current) { current = [d]; continue }
    const last = current[current.length - 1]
    const lastDow = getDow(last)
    const diffDays = (new Date(d) - new Date(last)) / 86400000
    // 水曜は単独 / 前のブロックの最後が水曜なら切る / 3日超なら切る
    if (isWed || lastDow === 3 || diffDays > 3) {
      blocks.push(current)
      current = [d]
    } else {
      current.push(d)
    }
  }
  if (current) blocks.push(current)

  const gameweeks = []
  for (const block of blocks) {
    const startDate = block[0]
    const endDate = block[block.length - 1]

    // ブロック内の全fixture
    const blockFixtures = block.flatMap(d => byDate[d])

    // ラウンドごとの試合数カウント → 最多ラウンドを主ラウンドとする
    const roundCounts = {}
    for (const f of blockFixtures) {
      const r = f.round_number
      if (r == null) continue
      roundCounts[r] = (roundCounts[r] ?? 0) + 1
    }
    const mainRound = Object.entries(roundCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
    if (!mainRound) continue

    // 主ラウンドのfixtureのみ対象
    const targetFixtures = blockFixtures.filter(f => String(f.round_number) === String(mainRound))

    // 5試合未満のブロックは除外（振り替え・先行開催少数など）
    if (targetFixtures.length < 5) continue

    gameweeks.push({ startDate, endDate, targetFixtures })
  }

  return gameweeks
}

export async function GET() {
  try {
    await ensureTables()

    // 2026シーズンの全試合取得
    const fixtures = await sql`
      SELECT id, date, round_number
      FROM fixtures
      WHERE season = 2026 AND round_number IS NOT NULL
      ORDER BY date ASC
    `

    const gameweeks = buildGameweeks(fixtures)

    // テーブル再作成済み（ensureTables内でDROP→CREATE）

    let gwNumber = 1
    for (const gw of gameweeks) {
      const [row] = await sql`
        INSERT INTO fantasy_gameweeks (gw_number, start_date, end_date, status)
        VALUES (${gwNumber}, ${gw.startDate}, ${gw.endDate}, 'upcoming')
        RETURNING id
      `
      for (const f of gw.targetFixtures) {
        await sql`
          INSERT INTO fantasy_gameweek_fixtures (gameweek_id, fixture_id)
          VALUES (${row.id}, ${f.id})
          ON CONFLICT DO NOTHING
        `
      }
      gwNumber++
    }

    // 結果確認用
    const result = await sql`
      SELECT fg.id, fg.gw_number, fg.start_date, fg.end_date, fg.status,
             COUNT(fgf.fixture_id) AS fixture_count
      FROM fantasy_gameweeks fg
      LEFT JOIN fantasy_gameweek_fixtures fgf ON fgf.gameweek_id = fg.id
      GROUP BY fg.id
      ORDER BY fg.gw_number
    `

    return Response.json({ ok: true, gameweeks: result })
  } catch (err) {
    console.error(err)
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
