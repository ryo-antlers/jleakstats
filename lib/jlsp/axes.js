/**
 * FANTYPE 4軸定義。コード順は axes.js → questions.js → type-meta.js で一貫して
 *   [shoubu, keiei, kansen, kanshin] とする。
 *   生成される 4 letter コード例: RWUO, EHAF など。
 *
 * 旧 JLSP との対応:
 *   - shoubu (R/E) : 維持
 *   - soshiki (S/I) → 削除
 *   - keiei (W/H)  : 「マネー/ハート」を「補強/育成」と表現変更、letter 維持
 *   - 観戦観 (U/A) : NEW、旧「熱狂度 F/U」を吸収しつつ「指定席/DAZN 分析派」も含める
 *   - 関心軸 (O/F) : NEW、ピッチ上のプレーだけ追うか、移籍・SNS・運営まで追うか
 */
export const AXES = [
  {
    id: 'shoubu',
    label: '勝負観',
    positive: { letter: 'R', name: '勝利至上', description: '勝つことこそすべて。結果がチームの価値を決める。' },
    negative: { letter: 'E', name: '美学', description: '勝ち負けより、心を揺さぶる試合内容にこそ価値がある。' },
  },
  {
    id: 'keiei',
    label: '経営観',
    positive: { letter: 'W', name: '補強派', description: 'スター選手を獲得して即戦力を積み上げるクラブが好きだ。' },
    negative: { letter: 'H', name: '育成派', description: 'アカデミーや生え抜きを大事にするクラブにこそ魅力を感じる。' },
  },
  {
    id: 'kansen',
    label: '観戦観',
    positive: { letter: 'U', name: '熱狂派', description: 'ゴール裏でコールに加わり、全身で熱狂したいタイプ。' },
    negative: { letter: 'A', name: '分析派', description: '指定席や DAZN で戦術を冷静に分析しながら観たいタイプ。' },
  },
  {
    id: 'kanshin',
    label: '関心軸',
    positive: { letter: 'O', name: '試合派', description: '興味はピッチの試合に集中。それ以外の情報は気にしない。' },
    negative: { letter: 'F', name: 'カルチャー派', description: '試合に加えて、移籍情報・選手 SNS・運営事情まで全部楽しむ。' },
  },
]

export const AXIS_IDS = AXES.map((a) => a.id)

export const AXIS_BY_ID = Object.fromEntries(AXES.map((a) => [a.id, a]))

export function emptyVector() {
  return { shoubu: 0, keiei: 0, kansen: 0, kanshin: 0 }
}
