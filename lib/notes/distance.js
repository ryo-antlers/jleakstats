// ユーザーの「今季の移動距離 (現地観戦)」を算出するユーティリティ
//   - 対象: watch_notes.watch_type = 'stadium' の試合
//   - 試合の会場 = ホームチームの home_stadium_lat/lng (カップ戦・特殊会場の誤差は許容)
//   - ユーザー出発地 = user_profiles.prefecture + city → lib/jp/geo.js で解決
//   - Haversine 距離を合計
import sql from '@/lib/db'
import { resolveUserGeo } from '@/lib/jp/geo'
import { distanceKm } from '@/lib/geo/haversine'

// userId + (prefecture, city) → 今季の現地観戦合計距離 [km]
//   - 住所未設定 / 該当ノートなし → 0
//   - 戻り値は四捨五入した整数 km (UI 表示用)
export async function calcSeasonStadiumDistanceKm({ clerkUserId, prefecture, city, season = 2026 }) {
  if (!clerkUserId) return 0

  const userGeo = resolveUserGeo(prefecture, city)
  if (!userGeo) return 0
  const [userLat, userLng] = userGeo

  // 今季 + watch_type='stadium' のノートと、各試合のホームチーム緯度経度を取得
  const rows = await sql`
    SELECT
      ht.home_stadium_lat::float8 AS lat,
      ht.home_stadium_lng::float8 AS lng
    FROM watch_notes wn
    JOIN fixtures f ON f.id = wn.fixture_id
    LEFT JOIN teams_master ht ON ht.id = f.home_team_id
    WHERE wn.clerk_user_id = ${clerkUserId}
      AND wn.watch_type = 'stadium'
      AND f.season = ${season}
  `

  let total = 0
  for (const r of rows) {
    const d = distanceKm(userLat, userLng, r.lat, r.lng)
    if (d != null) total += d
  }
  return Math.round(total)
}
