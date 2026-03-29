import Link from 'next/link'
import sql from '@/lib/db'
import { statusMap, formatDateJa } from '@/lib/utils'

async function getAllRounds() {
  const rows = await sql`
    SELECT DISTINCT round_number
    FROM fixtures
    WHERE season = 2026 AND round_number IS NOT NULL
    ORDER BY round_number ASC
  `
  return rows.map(r => r.round_number)
}

async function getCurrentRound(rounds) {
  // 最新の試合終了済み節を「今節」とする
  const row = await sql`
    SELECT round_number FROM fixtures
    WHERE season = 2026 AND status IN ('FT', 'AET', 'PEN', 'LIVE', 'HT')
    ORDER BY round_number DESC
    LIMIT 1
  `
  if (row.length > 0) return row[0].round_number
  // 試合がまだ始まっていなければ最初の節
  return rounds[0] ?? 1
}

async function getFixturesByRound(roundNumber) {
  const rows = await sql`
    SELECT
      f.*,
      ht.name_ja AS home_name, ht.short_name AS home_short,
      ht.color_primary AS home_color, ht.motif AS home_motif,
      at.name_ja AS away_name, at.short_name AS away_short,
      at.color_primary AS away_color, at.motif AS away_motif
    FROM fixtures f
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    WHERE f.season = 2026 AND f.round_number = ${roundNumber}
    ORDER BY f.date ASC
  `
  return rows
}

function FixtureCard({ fixture }) {
  const isFinished = ['FT', 'AET', 'PEN'].includes(fixture.status)
  const isLive = fixture.status === 'LIVE' || fixture.status === 'HT'
  const status = statusMap[fixture.status] ?? fixture.status

  return (
    <Link href={`/fixture/${fixture.id}`} className="block transition-opacity hover:opacity-75" style={{ textDecoration: 'none' }}>
      <div style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '12px 16px',
      }}>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs" style={{ color: isLive ? 'var(--accent)' : 'var(--text-secondary)' }}>
            {isLive ? `● LIVE ${fixture.elapsed ? fixture.elapsed + "'" : ''}` : status}
          </span>
          {!isFinished && !isLive && (
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {formatDateJa(fixture.date)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-lg leading-none">{fixture.home_motif ?? '⚽'}</span>
            <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {fixture.home_name ?? fixture.home_team_id}
            </span>
          </div>

          <div className="shrink-0 mx-2">
            {isFinished || isLive ? (
              <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                {fixture.home_score ?? 0}
                <span className="mx-1 text-sm" style={{ color: 'var(--text-secondary)' }}>-</span>
                {fixture.away_score ?? 0}
              </span>
            ) : (
              <span className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>VS</span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
            <span className="text-sm font-medium truncate text-right" style={{ color: 'var(--text-primary)' }}>
              {fixture.away_name ?? fixture.away_team_id}
            </span>
            <span className="text-lg leading-none">{fixture.away_motif ?? '⚽'}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

export default async function HomePage({ searchParams }) {
  const { round: roundParam } = await searchParams

  const rounds = await getAllRounds()

  if (rounds.length === 0) {
    return (
      <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
        <p className="text-lg mb-2">試合データがまだありません</p>
        <p className="text-sm">
          <a href="/admin" style={{ color: 'var(--accent)' }}>/admin</a> からデータを取得してください
        </p>
      </div>
    )
  }

  const currentRound = await getCurrentRound(rounds)
  const roundNumber = roundParam ? parseInt(roundParam) : currentRound

  // 有効な節番号にクランプ
  const validRound = rounds.includes(roundNumber) ? roundNumber : currentRound

  const fixtures = await getFixturesByRound(validRound)

  const idx = rounds.indexOf(validRound)
  const prevRound = idx > 0 ? rounds[idx - 1] : null
  const nextRound = idx < rounds.length - 1 ? rounds[idx + 1] : null

  const isCurrentRound = validRound === currentRound
  const hasScore = fixtures.some(f => ['FT', 'AET', 'PEN', 'LIVE', 'HT'].includes(f.status))

  return (
    <div>
      {/* 節ナビゲーション */}
      <div className="flex items-center justify-between mb-5">
        <Link
          href={prevRound ? `/?round=${prevRound}` : '#'}
          className={`flex items-center justify-center w-9 h-9 rounded-lg text-lg font-bold transition-colors ${!prevRound ? 'pointer-events-none opacity-20' : 'hover:opacity-75'}`}
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
        >
          ‹
        </Link>

        <div className="text-center">
          <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            第{validRound}節
          </p>
          {isCurrentRound && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--accent)' }}>
              {hasScore ? '今節' : '次節'}
            </p>
          )}
        </div>

        <Link
          href={nextRound ? `/?round=${nextRound}` : '#'}
          className={`flex items-center justify-center w-9 h-9 rounded-lg text-lg font-bold transition-colors ${!nextRound ? 'pointer-events-none opacity-20' : 'hover:opacity-75'}`}
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
        >
          ›
        </Link>
      </div>

      {/* 試合カード一覧 */}
      <div className="flex flex-col gap-2">
        {fixtures.map(f => (
          <FixtureCard key={f.id} fixture={f} />
        ))}
      </div>
    </div>
  )
}
