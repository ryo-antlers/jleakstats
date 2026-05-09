// 採点・掲示板で共通利用する NG ワードフィルタ
// 元は app/fantasy/setup/page.js にインライン定義されていたものを共通化
// （Fantasy 側は触らない方針のため、Fantasy は引き続きインライン版を使用）

export const NG_WORDS = [
  // 英語・性的
  'fuck', 'fucker', 'fucking', 'fucked', 'motherfucker', 'shit', 'bullshit',
  'bitch', 'asshole', 'ass', 'arse', 'dick', 'cock', 'penis', 'pussy',
  'cunt', 'tits', 'boobs', 'boob', 'titty', 'nipple', 'vagina', 'vulva',
  'anus', 'anal', 'butt', 'butthole', 'scrotum', 'testicle', 'balls',
  'cum', 'jizz', 'sperm', 'ejaculate', 'orgasm', 'masturbate', 'masturbation',
  'blowjob', 'handjob', 'rimjob', 'creampie', 'gangbang', 'threesome',
  'sex', 'porn', 'porno', 'nude', 'naked', 'hentai', 'erotic',
  'horny', 'kinky', 'fetish', 'bdsm', 'dildo', 'vibrator',
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'bastard', 'whore', 'slut',
  'rape', 'molest', 'pedophile', 'pedo', 'nazi', 'hitler', 'kkk',
  'kill', 'murder', 'suicide', 'terrorist', 'bomb',
  // 日本語・性的・身体
  'うんこ', 'うんち', 'うんぴ', 'うんにょ', 'くそ', 'クソ',
  'ちんこ', 'ちんぽ', 'ちんちん', 'まんこ', 'まんちょ', 'おまんこ',
  'きんたま', 'おっぱい', 'おちんちん', 'おちんぽ', 'ちくび', 'おしり',
  'けつ', 'ケツ', 'ふぐり', 'こうもん', 'アナル', 'おなに', 'オナニー',
  'せっくす', 'セックス', 'エロ', 'えろ', 'ポルノ', 'レイプ', 'わいせつ',
  'ヌード', 'はだか', '裸', 'ちんぽこ', 'まんすじ', 'パイズリ',
  'フェラ', 'クンニ', '中出し', '手マン', 'おまんちょ', 'おっぱっぴ',
  'ちんかす', 'まんかす', 'しおふき', '潮吹き', 'えろい', 'スケベ', 'すけべ',
  'ちんぽっぽ', 'まん汁', 'ちん汁',
  // 短い性的・卑語 (2文字以下、アバター文字対策)
  '電マ', '肉棒', '巨根', '巨乳', '貧乳', '童貞', '処女', '肛門',
  '射精', '淫乱', '痴漢', '痴女', '強姦', '援交', '不倫', '浮気',
  // 日本語・侮辱
  'バカ', '馬鹿', 'アホ', 'ボケ', 'カス', 'クズ', 'ゴミ', 'ブス',
  'デブ', 'キモい', 'きもい', 'うざい', 'ウザい', 'きちく', '鬼畜',
  'チョン', 'チャンコロ', 'ジャップ', 'ガイジ', 'きちがい', '気違い',
  // 日本語・暴力・危険
  '死ね', '死んで', '殺す', '殺せ', '爆弾', 'テロ', '自殺', 'ころす',
  '消えろ', 'くたばれ',
  // 運営・なりすまし系
  'admin', 'administrator', 'official', 'staff', 'moderator', 'mod',
  '運営', '公式', 'システム', '管理者', '管理人',
]

export function containsNG(text) {
  if (!text) return false
  const lower = String(text).toLowerCase()
  return NG_WORDS.some(w => lower.includes(w.toLowerCase()))
}
