// 投稿リアクションで使う OpenMoji の絵文字 code 一覧 (表示順)
// SVG ファイルは /public/icons/reactions/{code}.svg に配置
// アイコン: OpenMoji (CC BY-SA 4.0) https://openmoji.org/
export const REACTION_EMOJIS = [
  '1F642',
  '1F605',
  '1F923',
  '1F643',
  '1FAE0',
  '1F607',
  '1F929',
  '1F618',
  '1F92A',
  '1F911',
  '1F917',
  '1FAE2',
  '1F914',
  '1F928',
  '1F60F',
  '1F925',
  '1F642-200D-2194-FE0F',
  '1F924',
  '1F9D0',
  '1F450',
  '1F91D',
  '1FAF6',
]

export const REACTION_EMOJI_SET = new Set(REACTION_EMOJIS)

export function reactionIconSrc(emoji) {
  return `/icons/reactions/${emoji}.svg`
}
