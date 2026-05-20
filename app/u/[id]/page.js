import Link from 'next/link'
import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import sql from '@/lib/db'
import TopLogo from '@/app/components/TopLogo'
import ProfileHeader from '@/app/components/ProfileHeader'
import { TYPE_META } from '@/lib/fantype/type-meta'
import { calcSeasonStadiumDistanceKm } from '@/lib/notes/distance'
import {
  WATCH_TYPE_LABELS, ACCESS_LABELS,
  leagueLabel, formatJST,
} from '@/app/notes/_shared'

export const dynamic = 'force-dynamic'

// ───────────────────────────────────────────────
// 公開ユーザープロフィールページ /u/[id]
//   - id が handle 形式 (英数+_-, 3-20字) なら handle で resolve
//   - そうでなければ clerk_user_id として resolve
//   - 表示は /rating と同じ「選手別 採点」スタイル
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
  const isHandleLike = /^[a-zA-Z0-9_-]{3,20}$/.test(id) && !id.startsWith('user_')
  let rows
  if (isHandleLike) {
    rows = await sql`
      SELECT
        up.clerk_user_id, up.display_name, up.avatar_text, up.handle,
        up.supported_club_id, up.fantype_type_code, up.fantype_answers,
        up.jersey_number, up.favorite_player_id,
        up.prefecture, up.city, up.address_private, up.supporter_since,
        t.name_ja AS club_name_ja, t.color_primary AS club_color, t.abbr AS club_abbr,
        fp.name_ja AS favorite_player_name_ja,
        fp.name_en AS favorite_player_name_en,
        fp.position AS favorite_player_position,
        fp.no AS favorite_player_number
      FROM user_profiles up
      LEFT JOIN teams_master t ON t.id = up.supported_club_id
      LEFT JOIN players_master fp ON fp.id = up.favorite_player_id
      WHERE up.handle = ${id}
    `.catch(() => [])
    if (rows.length === 0) {
      rows = await sql`
        SELECT
          up.clerk_user_id, up.display_name, up.avatar_text, up.handle,
          up.supported_club_id, up.fantype_type_code, up.fantype_answers,
          up.jersey_number, up.favorite_player_id,
          up.prefecture, up.city, up.address_private, up.supporter_since,
          t.name_ja AS club_name_ja, t.color_primary AS club_color, t.abbr AS club_abbr,
          fp.name_ja AS favorite_player_name_ja,
          fp.name_en AS favorite_player_name_en,
          fp.position AS favorite_player_position,
          fp.no AS favorite_player_number
        FROM user_profiles up
        LEFT JOIN teams_master t ON t.id = up.supported_club_id
        LEFT JOIN players_master fp ON fp.id = up.favorite_player_id
        WHERE up.clerk_user_id = ${id}
      `.catch(() => [])
    }
  } else {
    rows = await sql`
      SELECT
        up.clerk_user_id, up.display_name, up.avatar_text, up.handle,
        up.supported_club_id, up.fantype_type_code, up.fantype_answers,
        up.jersey_number, up.favorite_player_id,
        up.prefecture, up.city, up.address_private, up.supporter_since,
        t.name_ja AS club_name_ja, t.color_primary AS club_color, t.abbr AS club_abbr,
        fp.name_ja AS favorite_player_name_ja,
        fp.name_en AS favorite_player_name_en,
        fp.position AS favorite_player_position,
        fp.no AS favorite_player_number
      FROM user_profiles up
      LEFT JOIN teams_master t ON t.id = up.supported_club_id
      LEFT JOIN players_master fp ON fp.id = up.favorite_player_id
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
    description: `${user.display_name} さんのプロフィールページ。好きなクラブ・FANTYPE・選手別採点を見る。`,
  }
}

export default async function UserProfilePage({ params }) {
  const { id } = await params
  const user = await resolveUser(id)
  if (!user) notFound()

  const { userId: viewerId } = await auth()
  const isOwnProfile = viewerId && viewerId === user.clerk_user_id

  const clerkUserId = user.clerk_user_id
  const supportedClubId = user.supported_club_id ? Number(user.supported_club_id) : null
  const clubColor = normalizeColor(user.club_color)
  const clubText = textOn(clubColor)
  const fantypeMeta = user.fantype_type_code ? TYPE_META[user.fantype_type_code] : null
  const fantypeHref = fantypeMeta
    ? `/fantype/result/${user.fantype_type_code}${user.fantype_answers ? `?a=${user.fantype_answers}` : ''}`
    : null

  // 今季の現地観戦距離 (km、四捨五入された整数)
  const seasonDistanceKm = await calcSeasonStadiumDistanceKm({
    clerkUserId,
    prefecture: user.prefecture,
    city: user.city,
  })

  // 観戦ノート直近 (最大 6 件)
  //   ログイン済みユーザーのみに公開、ゲストは空配列
  const recentNotes = viewerId ? await sql`
    SELECT wn.id, wn.fixture_id, wn.watch_type, wn.access, wn.companion, wn.memo,
           f.date AS fixture_date, f.home_team_id, f.away_team_id,
           f.home_score, f.away_score, f.home_penalty, f.away_penalty,
           f.status, f.league_id, f.round_number,
           ht.abbr AS home_abbr, ht.short_name AS home_short, ht.name_ja AS home_name, ht.color_primary AS home_color,
           at.abbr AS away_abbr, at.short_name AS away_short, at.name_ja AS away_name, at.color_primary AS away_color
    FROM watch_notes wn
    JOIN fixtures f ON f.id = wn.fixture_id
    LEFT JOIN teams_master ht ON ht.id = f.home_team_id
    LEFT JOIN teams_master at ON at.id = f.away_team_id
    WHERE wn.clerk_user_id = ${clerkUserId}
    ORDER BY f.date DESC
    LIMIT 6
  `.catch(() => []) : []

  // アバター文字
  const customAvatar = (user.avatar_text ?? '').trim()
  const initial = customAvatar || [...(user.display_name ?? '?').trim()].slice(0, 2).join('') || '?'

  // 推しクラブの全選手 (canonical only)
  const teamPlayers = supportedClubId ? await sql`
    SELECT
      pm.id AS player_id,
      pm.name_ja,
      pm.name_en AS player_name_en,
      pm.position,
      pm.no AS number
    FROM players_master pm
    WHERE pm.team_id = ${supportedClubId}
      AND pm.is_active = true
      AND (pm.canonical_id IS NULL OR pm.canonical_id = pm.id)
    ORDER BY
      CASE pm.position WHEN 'GK' THEN 1 WHEN 'DF' THEN 2 WHEN 'MF' THEN 3 WHEN 'FW' THEN 4 ELSE 5 END,
      pm.no ASC NULLS LAST,
      pm.name_ja
  `.catch(() => []) : []

  // 推しクラブの2026シーズン全試合 (相手チーム情報付き)
  const teamRoundsRows = supportedClubId ? await sql`
    SELECT
      f.round_number,
      (f.home_team_id = ${supportedClubId}) AS is_home,
      CASE WHEN f.home_team_id = ${supportedClubId} THEN at.abbr ELSE ht.abbr END AS opp_abbr,
      CASE WHEN f.home_team_id = ${supportedClubId} THEN at.color_primary ELSE ht.color_primary END AS opp_color
    FROM fixtures f
    LEFT JOIN teams_master ht ON ht.id = f.home_team_id
    LEFT JOIN teams_master at ON at.id = f.away_team_id
    WHERE f.season = 2026
      AND f.round_number IS NOT NULL
      AND (f.home_team_id = ${supportedClubId} OR f.away_team_id = ${supportedClubId})
    ORDER BY f.round_number ASC
  `.catch(() => []) : []
  const teamRounds = teamRoundsRows.map(r => ({
    round: Number(r.round_number),
    oppAbbr: r.opp_abbr,
    oppColor: r.opp_color,
    isHome: r.is_home,
  }))

  // このユーザーの推しクラブに対する全採点 (節ごと)
  const userTeamRatings = supportedClubId ? await sql`
    SELECT
      COALESCE(pm.canonical_id, pm.id) AS player_id,
      r.score, r.skipped, f.round_number
    FROM ratings r
    JOIN fixtures f ON f.id = r.fixture_id
    JOIN players_master pm ON pm.id = r.player_id
    JOIN fixture_lineups fl ON fl.fixture_id = r.fixture_id AND fl.player_id = r.player_id
    WHERE r.clerk_user_id = ${clerkUserId}
      AND fl.team_id = ${supportedClubId}
      AND f.season = 2026
      AND f.round_number IS NOT NULL
  `.catch(() => []) : []

  return (
    <div>
      <TopLogo />

      <ProfileHeader
        profile={user}
        clubColor={clubColor}
        clubText={clubText}
        avatarLetters={initial}
        fantypeMeta={fantypeMeta}
        fantypeHref={fantypeHref}
        seasonDistanceKm={seasonDistanceKm}
        isOwnPage={isOwnProfile}
      />

      {/* 選手別 採点 (推しクラブの選手 × 節 マトリクス) */}
      {supportedClubId && teamPlayers.length > 0 && (
        <PlayerRatingsSection
          players={teamPlayers}
          rounds={teamRounds}
          ratings={userTeamRatings}
        />
      )}

      {/* 観戦ノート (直近) — ログインユーザーのみに公開、選手別 採点の下に表示 */}
      {recentNotes.length > 0 && (
        <RecentNotesSection notes={recentNotes} isOwn={isOwnProfile} />
      )}
    </div>
  )
}

// ───────────────────────────────────────────────
// 観戦ノート (直近) セクション
//   - 最大 6 件のミニカード (試合スコア + 観戦区分 chip + companion + memo 抜粋)
//   - クリック先: 自分のページ → /notes/[fixture_id] (編集) / 他人 → /fixture/[id]
// ───────────────────────────────────────────────
function RecentNotesSection({ notes, isOwn }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10,
        marginBottom: 10, paddingBottom: 6,
        borderBottom: '1px solid #1a1a1a',
      }}>
        <h2 style={{
          fontSize: 12, fontWeight: 800, color: '#fff',
          letterSpacing: '0.18em', margin: 0, textTransform: 'uppercase',
        }}>観戦ノート</h2>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
          直近 {notes.length} 件
        </span>
        {isOwn && (
          <Link href="/notes" style={{
            marginLeft: 'auto',
            fontSize: 10, fontWeight: 700,
            color: 'rgba(255,255,255,0.6)',
            textDecoration: 'none',
            letterSpacing: '0.04em',
          }}>すべて見る →</Link>
        )}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 8,
      }}>
        {notes.map(n => (
          <NoteCard key={n.id} note={n} isOwn={isOwn} />
        ))}
      </div>
    </section>
  )
}

// 縦長のミニカード:
//   日付 / コンペ
//   ホームチーム (上、色付き帯)
//   アウェイチーム (下、色付き帯)
//   観戦区分 chip + アクセス chip
//   同行者 / メモ (簡潔に)
function NoteCard({ note, isOwn }) {
  const href = isOwn ? `/notes/${note.fixture_id}` : `/fixture/${note.fixture_id}`
  const homeColor = normalizeColor(note.home_color)
  const awayColor = normalizeColor(note.away_color)
  const homeText = textOn(homeColor)
  const awayText = textOn(awayColor)
  const homeName = note.home_abbr || note.home_short || note.home_name || '-'
  const awayName = note.away_abbr || note.away_short || note.away_name || '-'
  const comp = leagueLabel(note.league_id)
  return (
    <Link href={href} style={{
      display: 'flex', flexDirection: 'column',
      textDecoration: 'none', color: '#fff',
      border: '1px solid rgba(255,255,255,0.06)',
      backgroundColor: '#161616',
      overflow: 'hidden',
    }}>
      {/* ヘッダー: 日付 + コンペ */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        padding: '6px 8px 4px',
      }}>
        <span style={{ fontSize: 9, color: '#fff', fontWeight: 800, letterSpacing: '0.02em' }}>
          {formatJST(note.fixture_date)}
        </span>
        {comp && (
          <span style={{
            fontSize: 8, fontWeight: 800, letterSpacing: '0.08em',
            color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase',
          }}>
            {comp}{note.round_number ? ` 第${note.round_number}節` : ''}
          </span>
        )}
      </div>
      {/* ホーム vs アウェイ を縦並びに */}
      <TeamRow color={homeColor} textColor={homeText} name={homeName} score={note.home_score} />
      <TeamRow color={awayColor} textColor={awayText} name={awayName} score={note.away_score} />
      {/* 下段: chip + companion + memo */}
      <div style={{
        padding: '6px 8px', borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', gap: 4,
        flex: 1,
      }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <span style={miniChipStyle}>{WATCH_TYPE_LABELS[note.watch_type]}</span>
          {note.watch_type === 'stadium' && note.access && (
            <span style={miniChipStyle}>{ACCESS_LABELS[note.access]}</span>
          )}
        </div>
        {note.companion && (
          <div style={{
            fontSize: 9, color: 'rgba(255,255,255,0.65)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>同行: </span>{note.companion}
          </div>
        )}
        {note.memo && (
          <div style={{
            fontSize: 9, color: 'rgba(255,255,255,0.8)',
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>{note.memo}</div>
        )}
      </div>
    </Link>
  )
}

function TeamRow({ color, textColor, name, score }) {
  return (
    <div style={{
      backgroundColor: color, color: textColor,
      padding: '6px 10px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 6,
    }}>
      <span style={{
        fontWeight: 900, fontSize: 11, letterSpacing: '0.02em',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{name}</span>
      <span style={{
        fontWeight: 900, fontSize: 16, letterSpacing: '0.02em',
        fontVariantNumeric: 'tabular-nums',
      }}>{score ?? '-'}</span>
    </div>
  )
}

const miniChipStyle = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
  padding: '2px 6px', borderRadius: 999,
  color: 'rgba(255,255,255,0.85)',
  backgroundColor: 'rgba(255,255,255,0.08)',
}

// ───────────────────────────────────────────────
// 選手別 採点テーブル (節ごと、/rating と共通スタイル)
// ───────────────────────────────────────────────
const POS_ORDER = { GK: 1, DF: 2, MF: 3, FW: 4 }
const POS_COLOR = { GK: '#fbbf24', DF: '#60a5fa', MF: '#34d399', FW: '#f87171' }

function scoreColor(n) {
  if (n == null) return 'rgba(255,255,255,0.25)'
  if (n >= 7.5) return '#00ff87'
  if (n >= 6.5) return '#a3e635'
  if (n >= 5.5) return '#fff'
  return 'rgba(255,255,255,0.5)'
}

function PlayerRatingsSection({ players, rounds, ratings }) {
  const map = {}
  for (const r of ratings) {
    const pid = Number(r.player_id)
    const rnd = Number(r.round_number)
    map[pid] ??= {}
    map[pid][rnd] = { score: r.score == null ? null : Number(r.score), skipped: r.skipped }
  }

  const enriched = players.map(p => {
    const playerRatings = map[Number(p.player_id)] ?? {}
    const validScores = Object.values(playerRatings)
      .filter(r => r.score != null && !r.skipped)
      .map(r => r.score)
    const avg = validScores.length
      ? validScores.reduce((s, x) => s + x, 0) / validScores.length
      : null
    return { ...p, _ratings: playerRatings, _avg: avg }
  })

  const sorted = enriched.sort((a, b) => {
    const va = a._avg ?? -Infinity
    const vb = b._avg ?? -Infinity
    if (vb !== va) return vb - va
    const pa = POS_ORDER[a.position] ?? 5
    const pb = POS_ORDER[b.position] ?? 5
    if (pa !== pb) return pa - pb
    return (a.number ?? 999) - (b.number ?? 999)
  })

  const cellStyleBase = {
    padding: '6px 4px', textAlign: 'center',
    fontSize: 11, fontVariantNumeric: 'tabular-nums',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    borderRight: '1px solid rgba(255,255,255,0.08)',
    whiteSpace: 'nowrap',
    backgroundColor: '#222222',
  }
  const headStyle = {
    ...cellStyleBase,
    fontWeight: 800, fontSize: 9, letterSpacing: '0.06em',
    color: 'rgba(255,255,255,0.5)',
    borderBottom: '1px solid rgba(255,255,255,0.18)',
    backgroundColor: '#222222',
    position: 'sticky', top: 0, zIndex: 2,
  }
  const stickyLeft = (left) => ({
    position: 'sticky', left,
    backgroundColor: '#222222',
    zIndex: 50,
  })
  const stickyTopLeft = (left) => ({
    position: 'sticky', top: 0, left,
    backgroundColor: '#222222',
    zIndex: 100,
  })

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10,
        marginBottom: 10, paddingBottom: 6,
        borderBottom: '1px solid #1a1a1a',
      }}>
        <h2 style={{
          fontSize: 12, fontWeight: 800, color: '#fff',
          letterSpacing: '0.18em', margin: 0, textTransform: 'uppercase',
        }}>
          選手別 採点
        </h2>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
          {sorted.length}名
        </span>
      </div>
      <div className="rating-table-wrap" style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontFamily: 'inherit' }}>
          <thead>
            <tr>
              <th style={{ ...headStyle, ...stickyTopLeft(0), minWidth: 36, padding: 0, borderBottom: 'none' }} />
              <th style={{ ...headStyle, ...stickyTopLeft(36), minWidth: 32, padding: 0, borderBottom: 'none' }} />
              <th style={{ ...headStyle, ...stickyTopLeft(68), minWidth: 120, padding: 0, borderBottom: 'none' }} />
              <th style={{ ...headStyle, minWidth: 56, padding: 0, borderBottom: 'none' }} />
              {rounds.map(r => {
                const oppColor = r.oppColor && r.oppColor.startsWith('#') ? r.oppColor : (r.oppColor ? `#${r.oppColor}` : '#888')
                return (
                  <th key={r.round} style={{ ...headStyle, minWidth: 44, padding: 0, borderBottom: 'none' }}>
                    <div style={{
                      backgroundColor: r.oppAbbr ? oppColor : 'transparent',
                      color: r.oppAbbr ? textOn(oppColor) : 'transparent',
                      padding: '4px 4px',
                      fontSize: 9, fontWeight: 800, letterSpacing: '0.02em',
                      width: '100%', boxSizing: 'border-box', display: 'block',
                    }}>
                      {r.oppAbbr ? `vs ${r.oppAbbr}` : '—'}
                    </div>
                  </th>
                )
              })}
            </tr>
            <tr>
              <th style={{ ...headStyle, ...stickyTopLeft(0), top: 22, minWidth: 36, textAlign: 'left', paddingLeft: 8 }}>POS</th>
              <th style={{ ...headStyle, ...stickyTopLeft(36), top: 22, minWidth: 32 }}>#</th>
              <th style={{ ...headStyle, ...stickyTopLeft(68), top: 22, minWidth: 120, textAlign: 'left' }}>選手</th>
              <th style={{ ...headStyle, top: 22, minWidth: 56, color: '#00ff87' }}>平均</th>
              {rounds.map(r => (
                <th key={r.round} style={{ ...headStyle, minWidth: 44, fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>
                  第{r.round}節
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => {
              const playerRatings = p._ratings
              const avg = p._avg
              const name = p.name_ja ?? p.player_name_en ?? '-'
              return (
                <tr key={p.player_id}>
                  <td style={{
                    ...cellStyleBase, ...stickyLeft(0),
                    minWidth: 36, textAlign: 'left', paddingLeft: 8,
                    color: POS_COLOR[p.position] ?? '#888',
                    fontWeight: 800, fontSize: 10, letterSpacing: '0.04em',
                  }}>
                    {p.position ?? ''}
                  </td>
                  <td style={{
                    ...cellStyleBase, ...stickyLeft(36),
                    minWidth: 32,
                    color: 'rgba(255,255,255,0.6)', fontWeight: 700,
                  }}>
                    {p.number ?? ''}
                  </td>
                  <td style={{
                    ...cellStyleBase, ...stickyLeft(68),
                    minWidth: 120, textAlign: 'left',
                    color: '#fff', fontWeight: 700, fontSize: 12,
                    overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200,
                  }}>
                    {name}
                  </td>
                  <td style={{
                    ...cellStyleBase,
                    color: avg != null ? scoreColor(avg) : 'rgba(255,255,255,0.2)',
                    fontWeight: 900,
                  }}>
                    {avg != null ? avg.toFixed(2) : ''}
                  </td>
                  {rounds.map(r => {
                    const rating = playerRatings[r.round]
                    if (!rating || rating.skipped) {
                      return <td key={r.round} style={cellStyleBase}></td>
                    }
                    return (
                      <td key={r.round} style={{
                        ...cellStyleBase,
                        color: scoreColor(rating.score),
                        fontWeight: 800,
                      }}>
                        {Number(rating.score).toFixed(1)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
