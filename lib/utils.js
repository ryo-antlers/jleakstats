// 節番号変換: "Regular Season - 8" → "第8節"
export function getRoundNumber(round) {
  if (!round) return ''
  const match = round.match(/Regular Season - (\d+)/)
  return match ? `第${match[1]}節` : round
}

// 試合ステータス変換
export const statusMap = {
  'FT':   '試合終了',
  'NS':   '試合前',
  'LIVE': 'LIVE',
  'HT':   'ハーフタイム',
  'PEN':  'PK戦終了',
  'AET':  '延長終了',
  'PST':  '延期',
  'CANC': '中止',
  'ABD':  '中断',
}

// 日付フォーマット: UTC → 日本時間表示
export function formatDateJa(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
