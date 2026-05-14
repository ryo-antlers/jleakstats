import sql from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import TopLogo from '@/app/components/TopLogo'
import RatingsSection from '@/app/fixture/[id]/ratings-section'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: '採点 | J.Leak Stats',
}

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

export default async function RatingFixturePage({ params }) {
  const { id } = await params
  const fixtureId = Number(id)
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) notFound()

  const rows = await sql`
    SELECT
      f.id, f.date, f.home_score, f.away_score, f.home_penalty, f.away_penalty,
      f.status, f.round_number,
      ht.name_ja AS home_name, ht.short_name AS home_short, ht.abbr AS home_abbr,
      ht.color_primary AS home_color,
      at.name_ja AS away_name, at.short_name AS away_short, at.abbr AS away_abbr,
      at.color_primary AS away_color
    FROM fixtures f
    LEFT JOIN teams_master ht ON ht.id = f.home_team_id
    LEFT JOIN teams_master at ON at.id = f.away_team_id
    WHERE f.id = ${fixtureId}
  `.catch(() => [])
  const fixture = rows[0]
  if (!fixture) notFound()

  const homeColor = normalizeColor(fixture.home_color)
  const awayColor = normalizeColor(fixture.away_color)
  const isPK = fixture.status === 'PEN' && fixture.home_penalty != null

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', paddingTop: 18 }}>
      <TopLogo />

      {/* 試合ヘッダー (簡易) */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <Link href={`/fixture/${fixture.id}`} style={{
          fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em',
          textDecoration: 'none',
        }}>
          試合詳細へ ▸
        </Link>
      </div>

      <div style={{ display: 'flex', marginBottom: 12, alignItems: 'center', maxWidth: 560, margin: '0 auto 12px' }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
            {fixture.home_name ?? fixture.home_short ?? '-'}
          </span>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
            {fixture.away_name ?? fixture.away_short ?? '-'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', maxWidth: 560, margin: '0 auto 24px' }}>
        <div style={{ flex: 1, height: 48, backgroundColor: homeColor, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span style={{ fontSize: 26, fontWeight: 900, color: textOn(homeColor), lineHeight: 1 }}>
            {fixture.home_score ?? 0}
          </span>
          {isPK && (
            <span style={{ fontSize: 12, fontWeight: 900, color: textOn(homeColor), opacity: 0.7 }}>
              ({fixture.home_penalty})
            </span>
          )}
        </div>
        <div style={{ flex: 1, height: 48, backgroundColor: awayColor, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          {isPK && (
            <span style={{ fontSize: 12, fontWeight: 900, color: textOn(awayColor), opacity: 0.7 }}>
              ({fixture.away_penalty})
            </span>
          )}
          <span style={{ fontSize: 26, fontWeight: 900, color: textOn(awayColor), lineHeight: 1 }}>
            {fixture.away_score ?? 0}
          </span>
        </div>
      </div>

      <RatingsSection fixtureId={fixtureId} />
    </div>
  )
}
