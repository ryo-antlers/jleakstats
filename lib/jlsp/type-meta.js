/**
 * FANTYPE 16タイプ。
 * 軸順: 勝負観(R/E) → 経営観(W/H) → 観戦観(U/A) → 関心軸(O/F)
 *
 * 例:
 *   RWUO = 勝利+補強+熱狂+ピッチ上 = 「凱将」
 *   EHAF = 美学+育成+分析+ピッチ外 = 「文人」
 */
export const TYPE_META = {
  RWUO: {
    code: 'RWUO',
    nickname: '覇者',
    tagline: '強き者を讃え、勝利の凱旋に酔うサポーター',
    description:
      '補強で揃った最強のスターを、ゴール裏で全力で押し上げるタイプ。試合の結果が全てで、ピッチ上の支配こそが最大の歓び。勝利の頂を皆で味わう。',
    vector: { shoubu: +1, keiei: +1, kansen: +1, kanshin: +1 },
  },
  RWUF: {
    code: 'RWUF',
    nickname: '扇動者',
    tagline: '熱量と情報で仲間を巻き込む、応援の主役',
    description:
      'スター補強の最新ニュースを語り、ゴール裏で仲間を熱狂へ引き込むタイプ。クラブの全てを知り尽くしたうえで、自らの熱で場を支配する。',
    vector: { shoubu: +1, keiei: +1, kansen: +1, kanshin: -1 },
  },
  RWAO: {
    code: 'RWAO',
    nickname: '司令官',
    tagline: '補強された戦力を、冷徹に指揮する司令塔',
    description:
      '集められたスターたちの動きを、戦術的視点で読み解くタイプ。試合結果を求めるが、感情ではなく頭で楽しむ。ピッチ上の戦況を冷静に指揮するように観る。',
    vector: { shoubu: +1, keiei: +1, kansen: -1, kanshin: +1 },
  },
  RWAF: {
    code: 'RWAF',
    nickname: '知将',
    tagline: '経営戦略も戦術も読み解く、深謀の頭脳',
    description:
      'クラブの経営戦略から試合の戦術まで、全方位を分析するタイプ。移籍・契約・監督人事まで頭に入れた上で、勝利のベストを設計する知の参謀。',
    vector: { shoubu: +1, keiei: +1, kansen: -1, kanshin: -1 },
  },
  RHUO: {
    code: 'RHUO',
    nickname: '闘将',
    tagline: '育成と魂で強豪を撃ち落とす、ゴール裏の闘士',
    description:
      'アカデミー育ちの選手と共に、限られたリソースで強豪に挑むクラブを、ゴール裏で全身全霊で支えるタイプ。下剋上のロマンに生きる、熱量の戦士。',
    vector: { shoubu: +1, keiei: -1, kansen: +1, kanshin: +1 },
  },
  RHUF: {
    code: 'RHUF',
    nickname: '親方',
    tagline: 'アカデミーから運営事情まで知り尽くす、熱い親分肌',
    description:
      'クラブの育成方針、若手の昇格情報、運営の内側まで全部知っている熱血派。ゴール裏で熱く応援しつつ、移籍やアカデミーの裏側まで語れる、クラブの全てを愛するタイプ。',
    vector: { shoubu: +1, keiei: -1, kansen: +1, kanshin: -1 },
  },
  RHAO: {
    code: 'RHAO',
    nickname: '目利き',
    tagline: '育成出身の才能を、指定席から静かに評価する審美眼',
    description:
      'アカデミー出身選手のプレーを、指定席や DAZN から冷静に観察するタイプ。若手の伸びを見抜く目を持ち、結果を求めながらも騒がず、自分の眼で評価を下す職人気質。',
    vector: { shoubu: +1, keiei: -1, kansen: -1, kanshin: +1 },
  },
  RHAF: {
    code: 'RHAF',
    nickname: '探究者',
    tagline: '育成と運営の奥まで掘り下げる、深き探究者',
    description:
      'アカデミー方針、ユース大会、移籍市場の動向まで深く調べつつ、ピッチ上の若手のプレーも冷静に分析するタイプ。サッカーのあらゆる側面を探究する、知的なサポーター。',
    vector: { shoubu: +1, keiei: -1, kansen: -1, kanshin: -1 },
  },
  EWUO: {
    code: 'EWUO',
    nickname: '賛美者',
    tagline: '派手なスターの美しいプレーに、惜しみない賛美を捧げる',
    description:
      '大金で集められたスター選手たちが織りなす美しいプレーに、ゴール裏で大歓声を送るタイプ。勝敗より、ピッチで繰り広げられる芸術的な瞬間に酔いしれる、純粋な賛美者。',
    vector: { shoubu: -1, keiei: +1, kansen: +1, kanshin: +1 },
  },
  EWUF: {
    code: 'EWUF',
    nickname: '祝祭家',
    tagline: '派手な補強と移籍ニュースで祭りを起こす、盛り上げ役',
    description:
      'スター補強のニュースから試合の華やかさまで、すべてを祭りとして楽しむタイプ。ゴール裏で歓声をあげ、移籍速報で盛り上がり、サッカーを 365 日のフェスティバルとして生きる。',
    vector: { shoubu: -1, keiei: +1, kansen: +1, kanshin: -1 },
  },
  EWAO: {
    code: 'EWAO',
    nickname: '鑑識家',
    tagline: '大金で集められた美しい組織を、目利きで鑑識する紳士',
    description:
      '潤沢な予算で集められた選手たちが織りなす美しい組織サッカーを、指定席や DAZN で戦術論を交えてじっくり鑑識するタイプ。勝敗より、ピッチ上の芸術性を見抜く目利きの眼を持つ。',
    vector: { shoubu: -1, keiei: +1, kansen: -1, kanshin: +1 },
  },
  EWAF: {
    code: 'EWAF',
    nickname: '評論家',
    tagline: '戦術も移籍トレンドも斬る、サッカーの目利き評論家',
    description:
      '世界中の移籍市場、戦術トレンド、監督哲学を分析するタイプ。試合の美学を冷静に論じながら、ピッチ外のサッカーカルチャー全体に通じる。議論と論考を愛する評論家気質。',
    vector: { shoubu: -1, keiei: +1, kansen: -1, kanshin: -1 },
  },
  EHUO: {
    code: 'EHUO',
    nickname: '信徒',
    tagline: '信念の育成サッカーに、全身全霊で寄り添う信徒',
    description:
      'アカデミー出身の選手たちが美しい組織サッカーで挑むクラブに、ゴール裏で熱狂的に寄り添うタイプ。クラブの哲学と歩みを信仰のように信じ、求道者のように応援する。',
    vector: { shoubu: -1, keiei: -1, kansen: +1, kanshin: +1 },
  },
  EHUF: {
    code: 'EHUF',
    nickname: '親衛隊',
    tagline: 'クラブの全てを愛し、あらゆる情報を追う最深部のファン',
    description:
      '生え抜き育成の美学を愛し、ゴール裏で熱狂的に応援しつつ、アカデミー・移籍・運営・選手の SNS まで全て追うタイプ。クラブの全てが自分の人生に溶け込んだ、最深部のサポーター。',
    vector: { shoubu: -1, keiei: -1, kansen: +1, kanshin: -1 },
  },
  EHAO: {
    code: 'EHAO',
    nickname: '観想家',
    tagline: '育成の美学を、観想とともにゆっくり味わう',
    description:
      'アカデミー出身の選手たちが紡ぐ美しいサッカーを、指定席や DAZN で静かに観察するタイプ。勝敗にこだわらず、組織と哲学の積み重ねを長く穏やかに見守る、観想的なサポーター。',
    vector: { shoubu: -1, keiei: -1, kansen: -1, kanshin: +1 },
  },
  EHAF: {
    code: 'EHAF',
    nickname: '文人',
    tagline: '戦術も歴史も移籍も愛する、文化的サポーター',
    description:
      '育成と美学のサッカーを愛し、戦術分析と移籍ニュースとクラブの歴史を等しく楽しむタイプ。ピッチの内外を貫く文化的視点でサッカーを観る、文人気質のサポーター。',
    vector: { shoubu: -1, keiei: -1, kansen: -1, kanshin: -1 },
  },
}

export function getTypeMeta(code) {
  return TYPE_META[code]
}

/**
 * vector から 4 letter コードを生成する。
 *   shoubu  ≥ 0 → R / < 0 → E
 *   keiei   ≥ 0 → W / < 0 → H
 *   kansen  ≥ 0 → U / < 0 → A
 *   kanshin ≥ 0 → O / < 0 → F
 */
export function vectorToCode(v) {
  return (
    (v.shoubu  >= 0 ? 'R' : 'E') +
    (v.keiei   >= 0 ? 'W' : 'H') +
    (v.kansen  >= 0 ? 'U' : 'A') +
    (v.kanshin >= 0 ? 'O' : 'F')
  )
}
