import sql from '@/lib/db'
import Link from 'next/link'
import OverseasPlayersClient from './client'

export const revalidate = 0
export const dynamic = 'force-dynamic'

/**
 * 海外でプレーする日本人選手一覧 (確認用 admin ページ)。
 *
 * player_overseas_status (API-Football discover で同期) を元に、
 * 各選手の player_career_summary 最新シーズンから「元 J クラブ」を引き、
 * 海外クラブと並べて一覧表示する。
 *
 * 用途: discover 結果の目視チェック、誤マッチ発見、移籍漏れ確認。
 */
async function loadOverseas() {
  return await sql`
    SELECT
      pos.canonical_id,
      pm.name_ja,
      pm.name_en,
      pm.dob,
      pm.position AS canonical_position,
      pos.position AS api_position,
      pos.team_name      AS overseas_club,
      pos.team_logo      AS overseas_logo,
      pos.country,
      pos.league_name,
      pos.league_id,
      pos.api_football_id,
      pos.fetched_at,
      lj.team_id         AS j_team_id,
      lj.season_year     AS latest_j_season,
      lj.team_name_sfix  AS latest_j_team_sfix,
      t.name_ja          AS j_team_name,
      t.short_name       AS j_team_short,
      t.color_primary    AS j_team_color,
      jseasons.total_j_seasons
    FROM player_overseas_status pos
    JOIN players_master pm ON pm.id = pos.canonical_id
    LEFT JOIN LATERAL (
      SELECT team_id, season_year, team_name_sfix
      FROM player_career_summary
      WHERE canonical_id = pos.canonical_id
        AND team_id IS NOT NULL
        -- U-23 / 選抜は「元クラブ」として誤計上されるので除外
        AND team_id NOT IN (4316, 4320, 4325, 7000)
      ORDER BY season_year DESC
      LIMIT 1
    ) lj ON true
    LEFT JOIN teams_master t ON t.id = lj.team_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS total_j_seasons
      FROM player_career_summary
      WHERE canonical_id = pos.canonical_id
        AND team_id IS NOT NULL
        AND team_id NOT IN (4316, 4320, 4325, 7000)
    ) jseasons ON true
    ORDER BY pos.country ASC, pm.name_ja ASC
  `.catch((e) => {
    console.error('[overseas-players] load failed:', e)
    return []
  })
}

const COUNTRY_JA = {
  England: 'イングランド',
  Spain: 'スペイン',
  Italy: 'イタリア',
  Germany: 'ドイツ',
  France: 'フランス',
  Netherlands: 'オランダ',
  Portugal: 'ポルトガル',
  Belgium: 'ベルギー',
  Scotland: 'スコットランド',
  'South Korea': '韓国',
  USA: 'アメリカ',
  Switzerland: 'スイス',
  Austria: 'オーストリア',
  Denmark: 'デンマーク',
  Sweden: 'スウェーデン',
  Norway: 'ノルウェー',
  Turkey: 'トルコ',
  Cyprus: 'キプロス',
  'Saudi Arabia': 'サウジアラビア',
  // Phase 2 拡張 (2026-05-23)
  Greece: 'ギリシャ',
  Hungary: 'ハンガリー',
  Poland: 'ポーランド',
  'Czech Republic': 'チェコ',
  Croatia: 'クロアチア',
  Mexico: 'メキシコ',
  Brazil: 'ブラジル',
  'United Arab Emirates': 'UAE',
  Qatar: 'カタール',
  Australia: 'オーストラリア',
  Thailand: 'タイ',
  Indonesia: 'インドネシア',
  China: '中国',
}

export default async function OverseasPlayersPage() {
  const rows = (await loadOverseas()).map((r) => ({
    ...r,
    country_ja: COUNTRY_JA[r.country] ?? r.country,
  }))

  // 統計
  const byCountry = {}
  for (const r of rows) {
    byCountry[r.country] = (byCountry[r.country] ?? 0) + 1
  }
  const countriesSorted = Object.entries(byCountry).sort((a, b) => b[1] - a[1])

  // 元 J クラブ別カウント
  const byJTeam = {}
  for (const r of rows) {
    if (!r.j_team_name) continue
    byJTeam[r.j_team_name] = (byJTeam[r.j_team_name] ?? 0) + 1
  }
  const jTeamsSorted = Object.entries(byJTeam).sort((a, b) => b[1] - a[1])

  const withoutJ = rows.filter((r) => !r.j_team_id).length

  return (
    <div style={{ padding: '24px 16px', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ marginBottom: 8 }}>
        <Link href="/admin" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>
          ← /admin
        </Link>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '0.05em', marginBottom: 6 }}>
        海外でプレー中の日本人選手 ({rows.length}名)
      </h1>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
        player_overseas_status (API-Football 由来) × player_career_summary (元 J 所属歴)
      </p>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>
        J 所属歴なし: {withoutJ}名 (海外ユース上がり等、JLSP 結果ページには表示されない)
        {rows[0]?.fetched_at && (
          <span style={{ marginLeft: 12 }}>
            最終取得: {new Date(rows[0].fetched_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
          </span>
        )}
      </p>

      {/* 国別 summary chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {countriesSorted.map(([c, n]) => (
          <span
            key={c}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              background: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            {COUNTRY_JA[c] ?? c} <span style={{ opacity: 0.6 }}>· {n}</span>
          </span>
        ))}
      </div>

      {/* 元 J クラブ別 summary */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
        {jTeamsSorted.map(([name, n]) => (
          <span
            key={name}
            style={{
              padding: '3px 9px',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600,
              background: 'rgba(34,197,94,0.10)',
              color: 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(34,197,94,0.25)',
            }}
          >
            {name} <span style={{ opacity: 0.7 }}>{n}</span>
          </span>
        ))}
      </div>

      <OverseasPlayersClient rows={rows} />
    </div>
  )
}
