import { auth } from '@clerk/nextjs/server'
import Link from 'next/link'
import sql from '@/lib/db'
import { SEASON } from '@/lib/season'
import {
  WATCH_TYPE_LABELS, WATCH_TYPE_ICONS,
  normalizeColor, textOn, leagueLabel, formatJST,
} from './_shared'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: '観戦ノート | J.Leak Stats',
}

// ─────────────────────────────────────────────
// /notes — マイ観戦ノート
//   - 記録済み: watch_notes に登録済みのノート (新しい順)
//   - 未記録の試合: 推しクラブの終了済み試合のうち、まだノートが無いもの
// ─────────────────────────────────────────────
export default async function NotesPage() {
  const { userId } = await auth()
  if (!userId) {
    return (
      <>
        <EmptyState
          title="ログインが必要です"
          message="観戦ノートはログインユーザー専用です"
          actionLabel="サインイン"
          actionHref="/sign-in?redirect_url=/notes"
        />
      </>
    )
  }

  const profiles = await sql`
    SELECT supported_club_id
    FROM user_profiles
    WHERE clerk_user_id = ${userId}
  `
  const supportedClubId = profiles[0]?.supported_club_id ? Number(profiles[0].supported_club_id) : null

  // 記録済みノート (新しい順)
  const recorded = await sql`
    SELECT wn.id, wn.fixture_id, wn.watch_type, wn.next_visit_memo,
           wn.updated_at,
           f.date AS fixture_date, f.home_team_id, f.away_team_id,
           f.home_score, f.away_score, f.home_penalty, f.away_penalty,
           f.status, f.league_id, f.round_number,
           ht.abbr AS home_abbr, ht.short_name AS home_short, ht.name_ja AS home_name, ht.color_primary AS home_color,
           at.abbr AS away_abbr, at.short_name AS away_short, at.name_ja AS away_name, at.color_primary AS away_color
    FROM watch_notes wn
    JOIN fixtures f ON f.id = wn.fixture_id
    LEFT JOIN teams_master ht ON ht.id = f.home_team_id
    LEFT JOIN teams_master at ON at.id = f.away_team_id
    WHERE wn.clerk_user_id = ${userId}
    ORDER BY f.date DESC
  `

  // 未記録の試合 (推しクラブの終了済み試合 - 記録済み)
  const recordedIds = new Set(recorded.map(r => Number(r.fixture_id)))
  const unrecorded = supportedClubId ? await sql`
    SELECT f.id, f.date, f.home_team_id, f.away_team_id,
           f.home_score, f.away_score, f.home_penalty, f.away_penalty,
           f.status, f.league_id, f.round_number,
           ht.abbr AS home_abbr, ht.short_name AS home_short, ht.name_ja AS home_name, ht.color_primary AS home_color,
           at.abbr AS away_abbr, at.short_name AS away_short, at.name_ja AS away_name, at.color_primary AS away_color
    FROM fixtures f
    LEFT JOIN teams_master ht ON ht.id = f.home_team_id
    LEFT JOIN teams_master at ON at.id = f.away_team_id
    WHERE f.finished_at IS NOT NULL
      AND f.season = ${SEASON}
      AND (f.home_team_id = ${supportedClubId} OR f.away_team_id = ${supportedClubId})
    ORDER BY f.date DESC
    LIMIT 100
  `.then(rows => rows.filter(r => !recordedIds.has(Number(r.id)))) : []

  return (
    <div>

      <div style={{
        padding: '16px 0',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        marginBottom: 24,
      }}>
        <h1 style={{
          fontSize: 18, fontWeight: 900, color: '#fff',
          letterSpacing: '0.04em', margin: 0,
        }}>
          観戦ノート
        </h1>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: '6px 0 0' }}>
          試合ごとに「現地で観た / 配信 / TV / 観てない」、アクセス、同行者、次回観戦時の備忘メモを記録できます。
        </p>
      </div>

      {/* 記録済み */}
      <Section title="記録済み" count={recorded.length}>
        {recorded.length === 0 ? (
          <EmptyMessage>まだ観戦ノートはありません。下の「未記録の試合」から追加してください。</EmptyMessage>
        ) : (
          recorded.map(row => <NoteCard key={row.id} row={row} />)
        )}
      </Section>

      {/* 未記録 */}
      <Section title="未記録の試合" count={unrecorded.length}>
        {!supportedClubId ? (
          <EmptyMessage>
            推しクラブを設定すると、その試合のノートを記録できます。
            <Link href="/profile-setup?next=/notes" style={inlineLink}>プロフィール設定</Link>
          </EmptyMessage>
        ) : unrecorded.length === 0 ? (
          <EmptyMessage>すべての試合をノートに記録しました 🎉</EmptyMessage>
        ) : (
          unrecorded.map(row => <UnrecordedCard key={row.id} row={row} />)
        )}
      </Section>
    </div>
  )
}

function Section({ title, count, children }) {
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
        }}>{title}</h2>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{count}</span>
      </div>
      <div className="notes-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 12,
      }}>
        {children}
      </div>
    </section>
  )
}

function EmptyMessage({ children }) {
  return (
    <p style={{
      gridColumn: '1 / -1',
      padding: '24px 12px', fontSize: 12,
      color: 'rgba(255,255,255,0.4)', textAlign: 'center',
    }}>{children}</p>
  )
}

const inlineLink = {
  color: '#00ff87', textDecoration: 'none',
  marginLeft: 6, fontWeight: 700,
}

// 試合スコア + ノート概要
function NoteCard({ row }) {
  return (
    <Link href={`/rating/${row.fixture_id}`} style={cardStyle}>
      <FixtureHeader row={row} />
      <div style={{
        padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <IconChip Icon={WATCH_TYPE_ICONS[row.watch_type]} label={WATCH_TYPE_LABELS[row.watch_type]} />
        </div>
        {row.next_visit_memo && (
          <div style={{
            fontSize: 11, color: 'rgba(255,255,255,0.85)',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>{row.next_visit_memo}</div>
        )}
      </div>
    </Link>
  )
}

function UnrecordedCard({ row }) {
  return (
    <Link href={`/rating/${row.id}`} style={cardStyle}>
      <FixtureHeader row={row} />
      <div style={{
        padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontSize: 11, fontWeight: 800, color: '#00ff87',
          letterSpacing: '0.06em',
        }}>+ ノートを追加</span>
      </div>
    </Link>
  )
}

function FixtureHeader({ row }) {
  const homeColor = normalizeColor(row.home_color)
  const awayColor = normalizeColor(row.away_color)
  const homeText = textOn(homeColor)
  const awayText = textOn(awayColor)
  const homeName = row.home_abbr || row.home_short || row.home_name || '-'
  const awayName = row.away_abbr || row.away_short || row.away_name || '-'
  const comp = leagueLabel(row.league_id)
  const dateStr = formatJST(row.fixture_date ?? row.date)
  return (
    <>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        padding: '10px 12px 6px',
      }}>
        <span style={{ fontSize: 10, color: '#fff', fontWeight: 800, letterSpacing: '0.02em' }}>
          {dateStr}
        </span>
        {comp && (
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
            color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase',
          }}>
            {comp}{row.round_number ? ` 第${row.round_number}節` : ''}
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <div style={halfStyle(homeColor, homeText)}>
          <span style={teamNameStyle(homeText)}>{homeName}</span>
          <span style={scoreStyle(homeText)}>{row.home_score ?? '-'}</span>
        </div>
        <div style={halfStyle(awayColor, awayText)}>
          <span style={teamNameStyle(awayText)}>{awayName}</span>
          <span style={scoreStyle(awayText)}>{row.away_score ?? '-'}</span>
        </div>
      </div>
    </>
  )
}

const cardStyle = {
  display: 'block',
  textDecoration: 'none',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.06)',
  backgroundColor: '#161616',
  transition: 'border-color 0.12s ease',
}

const chipStyle = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
  padding: '3px 8px', borderRadius: 999,
  color: 'rgba(255,255,255,0.85)',
  backgroundColor: 'rgba(255,255,255,0.08)',
}

// アイコン (lucide コンポーネント) + ラベル のチップ
function IconChip({ Icon, label }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
      padding: '4px 9px', borderRadius: 999,
      color: 'rgba(255,255,255,0.85)',
      backgroundColor: 'rgba(255,255,255,0.08)',
    }}>
      {Icon ? <Icon size={12} strokeWidth={1.8} /> : null}
      <span>{label}</span>
    </span>
  )
}

const halfStyle = (bg, txt) => ({
  backgroundColor: bg, color: txt,
  padding: '8px 8px 12px',
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 2,
  minWidth: 0, minHeight: 60,
})
const teamNameStyle = (txt) => ({
  fontWeight: 900, fontSize: 12, color: txt,
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
})
const scoreStyle = (txt) => ({
  fontWeight: 900, fontSize: 22, color: txt, letterSpacing: '0.02em',
})

function EmptyState({ title, message, actionLabel, actionHref }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 20px', gap: 16, textAlign: 'center',
    }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '0.06em' }}>{title}</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, maxWidth: 420 }}>{message}</div>
      {actionLabel && actionHref && (
        <Link href={actionHref} style={{
          marginTop: 8, padding: '10px 20px', fontSize: 11, fontWeight: 800,
          letterSpacing: '0.1em', color: '#000', backgroundColor: '#00ff87',
          textDecoration: 'none', textTransform: 'uppercase',
        }}>{actionLabel}</Link>
      )}
    </div>
  )
}
