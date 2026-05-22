// ユーザーの「今季の移動距離 (現地観戦)」を算出するユーティリティ
//   - 対象: watch_notes.watch_type = 'stadium' の試合
//   - 試合の会場 = ホームチームの home_stadium_lat/lng
//   - 出発地 = 各 watch_notes の departure_prefecture / departure_city → lib/jp/geo.js で解決
//   - Haversine 距離を合計
//   - 出発地が未設定のノートは距離計算に含めない
import sql from '@/lib/db'
import { resolveUserGeo } from '@/lib/jp/geo'
import { distanceKm } from '@/lib/geo/haversine'

// userId → 今季の現地観戦合計距離 [km]
//   - 該当ノートなし / 出発地未設定 → 0
//   - 戻り値は四捨五入した整数 km (UI 表示用)
export async function calcSeasonStadiumDistanceKm({ clerkUserId, season = 2026 }) {
  if (!clerkUserId) return 0

  const rows = await sql`
    SELECT
      wn.departure_prefecture,
      wn.departure_city,
      ht.home_stadium_lat::float8 AS lat,
      ht.home_stadium_lng::float8 AS lng
    FROM watch_notes wn
    JOIN fixtures f ON f.id = wn.fixture_id
    LEFT JOIN teams_master ht ON ht.id = f.home_team_id
    WHERE wn.clerk_user_id = ${clerkUserId}
      AND wn.watch_type = 'stadium'
      AND f.season = ${season}
      AND wn.departure_prefecture IS NOT NULL
  `

  let total = 0
  for (const r of rows) {
    const geo = resolveUserGeo(r.departure_prefecture, r.departure_city)
    if (!geo) continue
    const d = distanceKm(geo[0], geo[1], r.lat, r.lng)
    if (d != null) total += d
  }
  return Math.round(total)
}
