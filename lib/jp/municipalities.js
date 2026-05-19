// 全国市区町村マスタ
//   出典: Geolonia japanese-addresses (MIT) — https://github.com/geolonia/japanese-addresses
//   元データ: 国土交通省 位置参照情報 (CC-BY)
//   形式: { "<都道府県>": ["<市区町村>", ...], ... } 全 47 都道府県 / 計 1,895 件
import municipalities from './municipalities.json'

export { municipalities }

export function isValidMunicipality(prefecture, city) {
  if (typeof prefecture !== 'string' || typeof city !== 'string') return false
  const list = municipalities[prefecture]
  if (!Array.isArray(list)) return false
  return list.includes(city)
}
