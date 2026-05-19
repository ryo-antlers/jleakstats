import Link from 'next/link'
import { notFound } from 'next/navigation'
import sql from '@/lib/db'
import TopLogo from '@/app/components/TopLogo'
import { TYPE_META } from '@/lib/jlsp/type-meta'

export const dynamic = 'force-dynamic'

// ───────────────────────────────────────────────
// 公開ユーザープロフィールページ
//   /u/[id]
//     - id が handle (英数 + _-) なら handle で resolve
//     - そうでなければ clerk_user_id として resolve
// ───────────────────────────────────────────────

function normalizeColor(raw) {
  if (!raw) return '#444'
  const v = String(raw).trim()
  if (!v) return '#444'
  return v.startsWith('#') ? v : `#${v}`
}

function textOn(hex) {
  const h = (hex ?? '').replace('#', '')
  if (h.length < 6) return '#fff'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? '#fff' : '#000'
}

async function resolveUser(id) {
  // id が handle 形式 (^[a-zA-Z0-9_-]+$, 3-20 chars) かつ clerk_user_id でない場合は handle で検索
  // clerk_user_id は通常 'user_' で始まる、長い
  const isHandleLike = /^[a-zA-Z0-9_-]{3,20}$/.test(id) && !id.startsWith('user_')

  let rows
  if (isHandleLike) {
    rows = await sql`
      SELECT
        up.clerk_user_id, up.display_name, up.avatar_text, up.handle,
        up.supported_club_id, up.jlsp_type_code, up.jlsp_answers,
        t.name_ja AS club_name_ja, t.color_primary AS club_color, t.abbr AS club_abbr
      FROM user_profiles up
      LEFT JOIN teams_master t ON t.id = up.supported_club_id
      WHERE up.handle = ${id}
    `.catch(() => [])
    if (rows.length === 0) {
      // handle で見つからなければ clerk_user_id でもトライ
      rows = await sql`
        SELECT
          up.clerk_user_id, up.display_name, up.avatar_text, up.handle,
          up.supported_club_id, up.jlsp_type_code, up.jlsp_answers,
          t.name_ja AS club_name_ja, t.color_primary AS club_color, t.abbr AS club_abbr
        FROM user_profiles up
        LEFT JOIN teams_master t ON t.id = up.supported_club_id
        WHERE up.clerk_user_id = ${id}
      `.catch(() => [])
    }
  } else {
    rows = await sql`
      SELECT
        up.clerk_user_id, up.display_name, up.avatar_text, up.handle,
        up.supported_club_id, up.jlsp_type_code, up.jlsp_answers,
        t.name_ja AS club_name_ja, t.color_primary AS club_color, t.abbr AS club_abbr
      FROM user_profiles up
      LEFT JOIN teams_master t ON t.id = up.supported_club_id
      WHERE up.clerk_user_id = ${id}
    `.catch(() => [])
  }
  return rows[0] ?? null
}

export async function generateMetadata({ params }) {
  const { id } = await params
  const user = await resolveUser(id)
  if (!user) return { title: 'ユーザーが見つかりません | J.Leak Stats' }
  return {
    title: `${user.display_name} | J.Leak Stats`,
    description: `${user.display_name} さんのプロフィールページ。好きなクラブ・FANTYPE・採点履歴を見る。`,
  }
}

export default async function UserProfilePage({ params }) {
  const { id } = await params
  const user = await resolveUser(id)
  if (!user) notFound()

  const clerkUserId = user.clerk_user_id
  const clubColor = normalizeColor(user.club_color)
  const clubText = textOn(clubColor)
  const fantypeMeta = user.jlsp_type_code ? TYPE_META[user.jlsp_type_code] : null
  const fantypeHref = fantypeMeta
    ? `/fantype/result/${user.jlsp_type_code}${user.jlsp_answers ? `?a=${user.jlsp_answers}` : ''}`
    : null

  // アバター文字
  const customAvatar = (user.avatar_text ?? '').trim()
  const initial = customAvatar || [...(user.display_name ?? '?').trim()].slice(0, 2).join('') || '?'

  // 採点履歴 (このユーザーが採点した試合の一覧、最新50件)
  const ratedHistory = await sql`
    SELECT
      f.id AS fixture_id, f.date, f.status, f.home_score, f.away_score,
      f.home_penalty, f.away_penalty,
      fl.team_id AS rated_team_id,
      ht.name_ja AS home_name, ht.abbr AS home_abbr, ht.color_primary AS home_color,
      at.name_ja AS away_name, at.abbr AS away_abbr, at.color_primary AS away_color,
      COUNT(DISTINCT r.id)::int AS rating_count,
      AVG(r.score)::float AS avg_score
    FROM ratings r
    JOIN fixture_lineups fl ON fl.fixture_id = r.fixture_id AND fl.player_id = r.player_id
    JOIN fixtures f ON f.id = r.fixture_id
    LEFT JOIN teams_master ht ON ht.id = f.home_team_id
    LEFT JOIN teams_master at ON at.id = f.away_team_id
    WHERE r.clerk_user_id = ${clerkUserId}
    GROUP BY f.id, fl.team_id, ht.id, at.id
    ORDER BY MAX(r.updated_at) DESC
    LIMIT 50
  `.catch(() => [])

  // 推しクラブの選手別評価サマリー (このユーザーが採点した選手の集計)
  const playerRatings = user.supported_club_id
    ? await sql`
        SELECT
          pm.id AS player_id,
          COALESCE(pm.name_ja, pm.name_en) AS player_name,
          pm.position,
          COUNT(DISTINCT r.fixture_id)::int AS matches_rated,
          AVG(r.score)::float AS avg_score
        FROM ratings r
        JOIN fixture_lineups fl ON fl.fixture_id = r.fixture_id AND fl.player_id = r.player_id
        JOIN players_master pm ON pm.id = r.player_id
        WHERE r.clerk_user_id = ${clerkUserId}
          AND fl.team_id = ${user.supported_club_id}
        GROUP BY pm.id, pm.name_ja, pm.name_en, pm.position
        ORDER BY COUNT(DISTINCT r.fixture_id) DESC, AVG(r.score) DESC
        LIMIT 30
      `.catch(() => [])
    : []

  const profileUrl = user.handle ? `/u/${user.handle}` : `/u/${clerkUserId}`

  return (
    <div>
      <TopLogo />

      {/* ユーザーヘッダー (案A 並列バッジ) */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '16px 0',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        marginBottom: 24,
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: '50%',
          backgroundColor: clubColor, color: clubText,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: initial.length === 2 ? 22 : 28, fontWeight: 900,
          letterSpacing: '0.02em', flexShrink: 0,
        }}>{initial}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: '0.04em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {user.display_name ?? '名無し'}
          </div>
          {user.handle && (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
              @{user.handle}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {user.club_name_ja && (
              <span style={{
                fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
                padding: '4px 10px', borderRadius: 999,
                color: clubText, backgroundColor: clubColor,
              }}>{user.club_name_ja}</span>
            )}
            {fantypeMeta && (
              <Link href={fantypeHref} style={{
                fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
                padding: '4px 10px', borderRadius: 999,
                color: '#000', backgroundColor: 'var(--accent)',
                textDecoration: 'none',
              }}>{user.jlsp_type_code} {fantypeMeta.nickname}</Link>
            )}
          </div>
        </div>
      </div>

      {/* 統計サマリー */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <Stat label="採点した試合" value={ratedHistory.length} />
        <Stat label="採点した選手" value={playerRatings.length} />
        {ratedHistory.length > 0 && (
          <Stat
            label="平均スコア"
            value={(ratedHistory.reduce((a, r) => a + (r.avg_score ?? 0), 0) / ratedHistory.length).toFixed(1)}
          />
        )}
      </div>

      {/* 推しクラブ選手別評価 */}
      {playerRatings.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{
            color: '#fff', fontSize: 13, fontWeight: 800,
            letterSpacing: '0.18em', margin: '0 0 16px', textTransform: 'uppercase',
          }}>
            {user.club_name_ja ?? '推しクラブ'} 選手別評価
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {playerRatings.map(p => (
              <div key={p.player_id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px',
                backgroundColor: 'rgba(255,255,255,0.03)',
                borderRadius: 6,
              }}>
                <Link href={`/player/${p.player_id}`} style={{
                  fontSize: 13, fontWeight: 700, color: '#fff', textDecoration: 'none', flex: 1,
                }}>
                  {p.player_name}
                  {p.position && (
                    <span style={{ marginLeft: 8, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                      {p.position}
                    </span>
                  )}
                </Link>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                  {p.matches_rated}試合
                </span>
                <span style={{
                  fontSize: 14, fontWeight: 900, color: 'var(--accent)', minWidth: 36, textAlign: 'right',
                }}>
                  {(p.avg_score ?? 0).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 採点履歴 (試合別) */}
      <section>
        <h2 style={{
          color: '#fff', fontSize: 13, fontWeight: 800,
          letterSpacing: '0.18em', margin: '0 0 16px', textTransform: 'uppercase',
        }}>
          採点履歴
        </h2>
        {ratedHistory.length === 0 ? (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', padding: '16px 0' }}>
            まだ採点した試合はありません
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ratedHistory.map(r => (
              <Link
                key={`${r.fixture_id}-${r.rated_team_id}`}
                href={`/fixture/${r.fixture_id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px',
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  borderRadius: 6,
                  textDecoration: 'none',
                }}
              >
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', minWidth: 70 }}>
                  {new Date(r.date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', flex: 1 }}>
                  {r.home_abbr ?? r.home_name?.slice(0, 4)} {r.home_score ?? '-'} - {r.away_score ?? '-'} {r.away_abbr ?? r.away_name?.slice(0, 4)}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                  {r.rating_count}人
                </span>
                <span style={{
                  fontSize: 14, fontWeight: 900, color: 'var(--accent)', minWidth: 36, textAlign: 'right',
                }}>
                  {(r.avg_score ?? 0).toFixed(1)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{
      padding: '12px 18px', borderRadius: 8,
      backgroundColor: 'rgba(255,255,255,0.04)',
      minWidth: 100,
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{value}</div>
    </div>
  )
}
