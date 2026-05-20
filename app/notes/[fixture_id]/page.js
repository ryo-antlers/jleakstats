import { auth } from '@clerk/nextjs/server'
import { notFound, redirect } from 'next/navigation'
import sql from '@/lib/db'
import TopLogo from '@/app/components/TopLogo'
import NoteForm from './note-form'
import {
  normalizeColor, textOn, leagueLabel, formatJST,
} from '../_shared'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }) {
  const { fixture_id } = await params
  return {
    title: `観戦ノート | 試合 #${fixture_id} | J.Leak Stats`,
  }
}

// ─────────────────────────────────────────────
// /notes/[fixture_id] — 個別ノート編集ページ
//   - 試合情報 (スコア) + ノート編集フォーム
//   - 既存ノートがあれば pre-fill、なければ新規
// ─────────────────────────────────────────────
export default async function NoteEditPage({ params }) {
  const { userId } = await auth()
  if (!userId) {
    const { fixture_id } = await params
    redirect(`/sign-in?redirect_url=/notes/${fixture_id}`)
  }

  const { fixture_id } = await params
  const fixtureId = Number(fixture_id)
  if (!Number.isInteger(fixtureId) || fixtureId <= 0) notFound()

  const fixtures = await sql`
    SELECT f.id, f.date, f.home_team_id, f.away_team_id,
           f.home_score, f.away_score, f.home_penalty, f.away_penalty,
           f.status, f.league_id, f.round_number, f.venue_name_ja,
           ht.abbr AS home_abbr, ht.short_name AS home_short, ht.name_ja AS home_name, ht.color_primary AS home_color,
           at.abbr AS away_abbr, at.short_name AS away_short, at.name_ja AS away_name, at.color_primary AS away_color
    FROM fixtures f
    LEFT JOIN teams_master ht ON ht.id = f.home_team_id
    LEFT JOIN teams_master at ON at.id = f.away_team_id
    WHERE f.id = ${fixtureId}
  `
  const fixture = fixtures[0]
  if (!fixture) notFound()

  const notes = await sql`
    SELECT id, watch_type, access, companion, memo, created_at, updated_at
    FROM watch_notes
    WHERE clerk_user_id = ${userId} AND fixture_id = ${fixtureId}
  `
  const note = notes[0] ?? null

  return (
    <div>
      <TopLogo />

      {/* 試合ヘッダー */}
      <FixtureHeader fixture={fixture} />

      {/* フォーム (Client Component) */}
      <NoteForm fixtureId={fixtureId} initialNote={note} />
    </div>
  )
}

function FixtureHeader({ fixture }) {
  const homeColor = normalizeColor(fixture.home_color)
  const awayColor = normalizeColor(fixture.away_color)
  const homeText = textOn(homeColor)
  const awayText = textOn(awayColor)
  const homeName = fixture.home_abbr || fixture.home_short || fixture.home_name || '-'
  const awayName = fixture.away_abbr || fixture.away_short || fixture.away_name || '-'
  const comp = leagueLabel(fixture.league_id)
  const dateStr = formatJST(fixture.date)
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        padding: '12px 12px 6px',
      }}>
        <span style={{ fontSize: 11, color: '#fff', fontWeight: 800, letterSpacing: '0.02em' }}>
          {dateStr}
        </span>
        {comp && (
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
            color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase',
          }}>
            {comp}{fixture.round_number ? ` 第${fixture.round_number}節` : ''}
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <div style={halfStyle(homeColor, homeText)}>
          <span style={teamNameStyle(homeText)}>{homeName}</span>
          <span style={scoreStyle(homeText)}>{fixture.home_score ?? '-'}</span>
        </div>
        <div style={halfStyle(awayColor, awayText)}>
          <span style={teamNameStyle(awayText)}>{awayName}</span>
          <span style={scoreStyle(awayText)}>{fixture.away_score ?? '-'}</span>
        </div>
      </div>
      {fixture.venue_name_ja && (
        <div style={{
          padding: '8px 12px', fontSize: 10, color: 'rgba(255,255,255,0.5)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          📍 {fixture.venue_name_ja}
        </div>
      )}
    </div>
  )
}

const halfStyle = (bg, txt) => ({
  backgroundColor: bg, color: txt,
  padding: '12px 12px 16px',
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 2,
  minWidth: 0, minHeight: 70,
})
const teamNameStyle = (txt) => ({
  fontWeight: 900, fontSize: 14, color: txt,
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
})
const scoreStyle = (txt) => ({
  fontWeight: 900, fontSize: 28, color: txt, letterSpacing: '0.02em',
})
