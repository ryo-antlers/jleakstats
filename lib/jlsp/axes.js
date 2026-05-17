export const AXES = [
  {
    id: 'shoubu',
    label: '勝負観',
    positive: { letter: 'R', name: '勝利至上', description: '勝つことこそすべて。結果がチームの価値を決める。' },
    negative: { letter: 'E', name: '美学重視', description: '勝ち負けより、心を揺さぶる試合内容にこそ価値がある。' },
  },
  {
    id: 'soshiki',
    label: '組織観',
    positive: { letter: 'S', name: '組織型', description: '規律ある戦術と全員の連動こそが強さの本質。' },
    negative: { letter: 'I', name: '個性型', description: 'ひとりの閃きが試合を決める瞬間にしびれる。' },
  },
  {
    id: 'keiei',
    label: '経営観',
    positive: { letter: 'W', name: 'マネー派', description: '資金力・補強・経営規模こそクラブの強さを支えると考える。' },
    negative: { letter: 'H', name: 'ハート派', description: '育成と忠誠、クラブ愛と伝統こそ強さの根源だと信じる。' },
  },
  {
    id: 'nekkyou',
    label: '熱狂度',
    positive: { letter: 'F', name: '穏やか派', description: '家族や友人とまったり観戦したい。スタグルや街歩きも含めて楽しむ。' },
    negative: { letter: 'U', name: '過激派', description: 'スタジアムで大声で歌い、コールに加わって暴れたい。喜怒哀楽は全開。' },
  },
]

export const AXIS_IDS = AXES.map((a) => a.id)

export const AXIS_BY_ID = Object.fromEntries(AXES.map((a) => [a.id, a]))

export function emptyVector() {
  return { shoubu: 0, soshiki: 0, keiei: 0, nekkyou: 0 }
}
