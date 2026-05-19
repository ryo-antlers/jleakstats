/**
 * FANTYPE 32問。4軸 × 8問 (うち各 direction +1/-1 を 4問ずつ)。
 * direction = +1: 賛成すると + 側letter に寄る
 * direction = -1: 賛成すると − 側letter に寄る
 *
 * 軸ID: shoubu (R/E) | keiei (W/H) | kansen (U/A) | kanshin (O/F)
 *
 * 32問はすべて日常質問。サッカー文脈は使わず、性格傾向・嗜好を間接的に問う。
 * (サッカー濃度の高い質問は JLCL = jlcl.jleakstats.com に集約予定)
 */
export const QUESTIONS = [
  // ===== Round 1 (q01–q08) =====
  { id: 'q01', axis: 'shoubu',  direction: +1, statement: '旅行の計画は、効率よく回るルートを組みたい。' },
  { id: 'q02', axis: 'keiei',   direction: +1, statement: '慣れない作業は、専門家にお願いするのが一番だと思う。' },
  { id: 'q03', axis: 'kansen',  direction: +1, statement: '大勢で何かを楽しむと、自分も自然と巻き込まれていく。' },
  { id: 'q04', axis: 'kanshin', direction: +1, statement: '興味のあることは、本筋だけ知れば満足できる。' },
  { id: 'q05', axis: 'shoubu',  direction: -1, statement: '手加減されて勝つよりも、全力で勝負して負けた方がいい。' },
  { id: 'q06', axis: 'keiei',   direction: -1, statement: '試行錯誤しながら自分でやってみる時間が好きだ。' },
  { id: 'q07', axis: 'kansen',  direction: -1, statement: '賑やかな場所より、静かに過ごせる時間に癒される。' },
  { id: 'q08', axis: 'kanshin', direction: -1, statement: 'ハマったものは、起源や歴史まで掘り下げたくなる。' },

  // ===== Round 2 (q09–q16) =====
  { id: 'q09', axis: 'shoubu',  direction: +1, statement: '達成感は、自分が得たもので測れると思う。' },
  { id: 'q10', axis: 'keiei',   direction: +1, statement: 'お金を払って手間が減るなら、迷わず払う方だ。' },
  { id: 'q11', axis: 'kansen',  direction: +1, statement: '笑ったり泣いたり、感情が大きく動く瞬間が好きだ。' },
  { id: 'q12', axis: 'kanshin', direction: +1, statement: '必要のない情報は、なるべく目に入れたくない。' },
  { id: 'q13', axis: 'shoubu',  direction: -1, statement: '完璧な料理より、ちょっと焦げた家庭料理に惹かれる。' },
  { id: 'q14', axis: 'keiei',   direction: -1, statement: '観葉植物や生き物を、時間をかけて育てるのが好きだ。' },
  { id: 'q15', axis: 'kansen',  direction: -1, statement: '物事は、いったん頭の中で整理してから動きたい。' },
  { id: 'q16', axis: 'kanshin', direction: -1, statement: '一つの作品から、関連作や監督の他作品も探したくなる。' },

  // ===== Round 3 (q17–q24) =====
  { id: 'q17', axis: 'shoubu',  direction: +1, statement: '何かを成し遂げた話は、過程より結果が気になる。' },
  { id: 'q18', axis: 'keiei',   direction: +1, statement: '評判の高い既成品の方が、安心して選べる。' },
  { id: 'q19', axis: 'kansen',  direction: +1, statement: 'イベントは現地で参加してこそ、本当に楽しめる。' },
  { id: 'q20', axis: 'kanshin', direction: +1, statement: 'SNS の「裏垢」みたいなものは、追わない方が幸せだと思う。' },
  { id: 'q21', axis: 'shoubu',  direction: -1, statement: '効率より、試行錯誤の時間そのものが大事だ。' },
  { id: 'q22', axis: 'keiei',   direction: -1, statement: '急に手に入れたものより、ゆっくり馴染んだものに愛着がある。' },
  { id: 'q23', axis: 'kansen',  direction: -1, statement: '賑やかな場では、つい一歩引いてしまう。' },
  { id: 'q24', axis: 'kanshin', direction: -1, statement: '「これ作った人どんな人だろう」と気になる癖がある。' },

  // ===== Round 4 (q25–q32) =====
  { id: 'q25', axis: 'shoubu',  direction: +1, statement: '「やったかどうか」より「達成したかどうか」が大事だ。' },
  { id: 'q26', axis: 'keiei',   direction: +1, statement: 'プロの仕事や専門家の意見に、お金をかける価値がある。' },
  { id: 'q27', axis: 'kansen',  direction: +1, statement: '楽しい場では、人より声が大きくなりがちだ。' },
  { id: 'q28', axis: 'kanshin', direction: +1, statement: '趣味は、必要最低限の道具で楽しめれば十分だ。' },
  { id: 'q29', axis: 'shoubu',  direction: -1, statement: '失敗からの方が、得るものが多い気がする。' },
  { id: 'q30', axis: 'keiei',   direction: -1, statement: '一気に手に入るものより、コツコツ積み上げたものに価値を感じる。' },
  { id: 'q31', axis: 'kansen',  direction: -1, statement: '周りが盛り上がっていても、自分はワンテンポ遅れることが多い。' },
  { id: 'q32', axis: 'kanshin', direction: -1, statement: '業界の裏話や、舞台裏のドキュメンタリーが好きだ。' },
]
