import sql from '@/lib/db'

/**
 * 現在の移籍市場が開いているか判定する。
 * 開いている → null を返す
 * 閉じている → エラーメッセージ文字列を返す
 *
 * ロジック:
 *   1. 次の締め切り（未来）が存在する → 締め切り前 → オープン
 *   2. 直近の締め切りを過ぎていて、market_open がまだ未来 → クローズ
 *   3. それ以外（全GW終了済み・GWなし） → オープン
 */
export async function checkMarketOpen() {
  const now = new Date()

  const rows = await sql`
    SELECT
      fg.id,
      MIN(f.date) AS first_kickoff,
      MAX(f.date) AS last_kickoff
    FROM fantasy_gameweeks fg
    LEFT JOIN fantasy_gameweek_fixtures fgf ON fgf.gameweek_id = fg.id
    LEFT JOIN fixtures f ON f.id = fgf.fixture_id
    GROUP BY fg.id
    ORDER BY MIN(f.date)
  `

  const gws = rows
    .filter(gw => gw.first_kickoff)
    .map(gw => {
      const deadline   = new Date(new Date(gw.first_kickoff).getTime() - 3 * 60 * 60 * 1000)
      // 最終戦翌日の正午12:00 JST (= 03:00 UTC)
      const lastJST = new Date(new Date(gw.last_kickoff).getTime() + 9 * 60 * 60 * 1000)
      const nextDayNoonJST = new Date(Date.UTC(lastJST.getUTCFullYear(), lastJST.getUTCMonth(), lastJST.getUTCDate() + 1, 3, 0, 0)) // +1day, noon JST = 03:00 UTC
      const marketOpen = nextDayNoonJST
      return { deadline, marketOpen }
    })

  if (gws.length === 0) return null // GWデータなし → オープン

  // 締め切りが過ぎたGWの中で最も新しいもの＝「現在のGW」
  const pastGws = [...gws].filter(gw => gw.deadline <= now)

  if (pastGws.length === 0) {
    // まだどのGWの締め切りも来ていない → オープン（シーズン開幕前）
    return null
  }

  const currentGw = pastGws[pastGws.length - 1] // 最後の要素が最新

  if (now < currentGw.marketOpen) {
    // 締め切り済み・market_open 前 → クローズ
    const openStr = currentGw.marketOpen.toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
    return `移籍市場は締め切られています。次の市場オープンは${openStr}です。`
  }

  // market_open 過ぎ → オープン
  return null
}
