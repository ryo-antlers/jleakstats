// 2 点間の大円距離 (Haversine 公式)
//   - 地球を半径 EARTH_RADIUS_KM の球と仮定
//   - 移動距離の合計表示用 (シーズン累計で誤差 1% 未満、用途には十分)
//   - 入力: 緯度経度を度数 (degrees) で。NaN / null は null を返す

const EARTH_RADIUS_KM = 6371

function toRad(deg) {
  return (deg * Math.PI) / 180
}

// (lat1, lng1) → (lat2, lng2) の距離 [km]
//   - 入力に null/undefined/NaN を含んでいたら null
//   - 同地点なら 0
export function distanceKm(lat1, lng1, lat2, lng2) {
  const a1 = Number(lat1)
  const o1 = Number(lng1)
  const a2 = Number(lat2)
  const o2 = Number(lng2)
  if (![a1, o1, a2, o2].every(Number.isFinite)) return null

  const dLat = toRad(a2 - a1)
  const dLng = toRad(o2 - o1)
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a1)) * Math.cos(toRad(a2)) * sinDLng * sinDLng
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
  return EARTH_RADIUS_KM * c
}
