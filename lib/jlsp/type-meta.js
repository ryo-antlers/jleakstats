/**
 * 16 タイプの解説。
 * 軸: R(勝利至上)/E(美学) × S(組織)/I(個性) × W(マネー)/H(ハート) × F(穏やか)/U(過激)
 */
export const TYPE_META = {
  RSWF: {
    code: 'RSWF',
    nickname: 'ドン',
    tagline: '資金力と組織で築く、王者の品格。',
    description:
      '潤沢な経営資源と戦術的規律でタイトルを獲り続けるクラブを、家族や仲間と紳士的に応援したいタイプ。安定感ある勝者の風格を愛する。',
    vector: { shoubu: +1, soshiki: +1, keiei: +1, nekkyou: +1 },
  },
  RSWU: {
    code: 'RSWU',
    nickname: 'コマンダー',
    tagline: '金と組織と熱狂、すべてを勝利に注ぐ。',
    description:
      '経営力ある強豪が組織サッカーで勝ち上がる姿に、声を枯らして熱狂したいタイプ。クラブの強さは資金と熱量の合算であると信じる。',
    vector: { shoubu: +1, soshiki: +1, keiei: +1, nekkyou: -1 },
  },
  RSHF: {
    code: 'RSHF',
    nickname: 'クラフトマン',
    tagline: '育成と忠誠で勝ち上がる、町の名工。',
    description:
      '自前の選手と組織哲学で結果を出すクラブを、家族・仲間と静かに支えたいタイプ。長く愛するクラブと年月を重ねていきたい。',
    vector: { shoubu: +1, soshiki: +1, keiei: -1, nekkyou: +1 },
  },
  RSHU: {
    code: 'RSHU',
    nickname: 'レベル',
    tagline: '育成と魂で、強豪をぶっ倒す。',
    description:
      '限られたリソースを組織と情熱で補い、上位を脅かすクラブに、声を枯らして肩入れするタイプ。下剋上のロマンを生きる。',
    vector: { shoubu: +1, soshiki: +1, keiei: -1, nekkyou: -1 },
  },
  RIWF: {
    code: 'RIWF',
    nickname: 'コネスール',
    tagline: '高額スターの所作を、上品に味わう。',
    description:
      '資金力で集めたスター選手の個人技と勝利を、戦術論を交えながら紳士的に楽しむタイプ。豪華なメンバー表を眺めるだけで満ち足りる。',
    vector: { shoubu: +1, soshiki: -1, keiei: +1, nekkyou: +1 },
  },
  RIWU: {
    code: 'RIWU',
    nickname: 'ショーマン',
    tagline: '金と熱狂、これぞ究極のショー。',
    description:
      'ビッグネームを並べて派手なサッカーで勝ち上がるクラブに、最大ボリュームで乗りたいタイプ。サッカーは祝祭であるべきだと信じる。',
    vector: { shoubu: +1, soshiki: -1, keiei: +1, nekkyou: -1 },
  },
  RIHF: {
    code: 'RIHF',
    nickname: 'メンター',
    tagline: '育てた天才が、また結果を出した。',
    description:
      '生え抜きのスターを家族のように見守り、活躍する姿を穏やかに讃えるタイプ。クラブと選手の歩みを長く追いかけたい。',
    vector: { shoubu: +1, soshiki: -1, keiei: -1, nekkyou: +1 },
  },
  RIHU: {
    code: 'RIHU',
    nickname: 'マーヴェリック',
    tagline: '地元の天才と、声を枯らして戦う。',
    description:
      '育成出身のエースが闘い抜く姿に、声を枯らして並走するタイプ。スタジアムは街の戦場であると信じる。',
    vector: { shoubu: +1, soshiki: -1, keiei: -1, nekkyou: -1 },
  },
  ESWF: {
    code: 'ESWF',
    nickname: 'アーキテクト',
    tagline: '資金力で築いた美しい組織を、紳士的に愛でる。',
    description:
      '潤沢な予算で集めた選手が美しい組織サッカーを織りなすさまを、戦術論で味わうタイプ。勝敗より、ピッチ上の絵に価値を置く。',
    vector: { shoubu: -1, soshiki: +1, keiei: +1, nekkyou: +1 },
  },
  ESWU: {
    code: 'ESWU',
    nickname: 'プロフェット',
    tagline: '美学と熱狂は、両立する。',
    description:
      '資金力ある強豪が美しい組織サッカーを掲げる姿に、コール隊として身を投じるタイプ。戦術哲学を信じて声を捧げる。',
    vector: { shoubu: -1, soshiki: +1, keiei: +1, nekkyou: -1 },
  },
  ESHF: {
    code: 'ESHF',
    nickname: 'セージ',
    tagline: '育成の組織サッカーを、ゆっくり噛みしめる。',
    description:
      '限られた予算ながら組織と哲学で美しいサッカーを志向するクラブを、長く穏やかに支えるタイプ。クラブと共に年を重ねたい。',
    vector: { shoubu: -1, soshiki: +1, keiei: -1, nekkyou: +1 },
  },
  ESHU: {
    code: 'ESHU',
    nickname: 'パイオニア',
    tagline: '信念のサッカーに、命を懸ける。',
    description:
      '経営規模に頼らず、美しい組織サッカーで強豪に挑むクラブの物語に、熱狂的に肩入れするタイプ。求道者のような応援。',
    vector: { shoubu: -1, soshiki: +1, keiei: -1, nekkyou: -1 },
  },
  EIWF: {
    code: 'EIWF',
    nickname: 'ダンディ',
    tagline: '高額スターの芸術を、静かに愛でる。',
    description:
      '資金力で集めたスター選手の個人技を、落ち着いた席でじっくり鑑賞したいタイプ。勝敗より個の輝きを味わう。',
    vector: { shoubu: -1, soshiki: -1, keiei: +1, nekkyou: +1 },
  },
  EIWU: {
    code: 'EIWU',
    nickname: 'ジーロット',
    tagline: 'スターに、すべてを捧げる。',
    description:
      '資金力で連れてきたファンタジスタに、最大の熱量で寄り添うタイプ。サッカーは天才のための舞台であると信じる。',
    vector: { shoubu: -1, soshiki: -1, keiei: +1, nekkyou: -1 },
  },
  EIHF: {
    code: 'EIHF',
    nickname: 'ポエット',
    tagline: '生え抜きの一閃を、静かに味わう。',
    description:
      '育成出身の選手の個性をじっくり愛でるタイプ。クラブの文化と人物のドラマに惹かれる、文学的サポーター。',
    vector: { shoubu: -1, soshiki: -1, keiei: -1, nekkyou: +1 },
  },
  EIHU: {
    code: 'EIHU',
    nickname: 'レヴェラー',
    tagline: '育成の天才と、共に祭りを起こす。',
    description:
      '生え抜きの個性派と共に過激に応援するタイプ。スタジアムは街最大の祭りであり、勝敗より瞬間の輝きを生きる。',
    vector: { shoubu: -1, soshiki: -1, keiei: -1, nekkyou: -1 },
  },
}

export function getTypeMeta(code) {
  return TYPE_META[code]
}

export function vectorToCode(v) {
  return (
    (v.shoubu >= 0 ? 'R' : 'E') +
    (v.soshiki >= 0 ? 'S' : 'I') +
    (v.keiei >= 0 ? 'W' : 'H') +
    (v.nekkyou >= 0 ? 'F' : 'U')
  )
}
