import sql from '@/lib/db'
import Link from 'next/link'

async function getStandings() {
  const rows = await sql`
    SELECT s.*, tm.name_ja, tm.short_name, tm.color_primary, tm.color_secondary
    FROM standings s
    LEFT JOIN teams_master tm ON s.team_id = tm.id
    WHERE s.season = 2026
    ORDER BY s.group_name ASC, s.rank ASC
  `.catch(() => [])
  return rows
}

function FormBadges({ form }) {
  if (!form) return null
  return (
    <div className="flex gap-0.5">
      {form.split('').map((c, i) => (
        <span key={i} className="w-4 h-4 flex items-center justify-center text-xs font-bold rounded-sm" style={{
          backgroundColor: c === 'W' ? 'var(--accent)' : c === 'L' ? 'var(--danger)' : 'var(--warning)',
          color: '#000',
          fontSize: '10px',
        }}>
          {c}
        </span>
      ))}
    </div>
  )
}

function StandingsTable({ title, rows }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-bold mb-3 px-1" style={{ color: 'var(--text-primary)' }}>{title}</h2>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
        {/* ヘッダー */}
        <div className="grid text-xs font-medium px-3 py-2" style={{
          backgroundColor: 'var(--bg-tertiary)',
          color: 'var(--text-secondary)',
          gridTemplateColumns: '2rem 1fr 2.5rem 2.5rem 2.5rem 2.5rem 2.5rem 3rem 5rem',
          gap: '0',
        }}>
          <span>#</span>
          <span>クラブ</span>
          <span className="text-center">試</span>
          <span className="text-center">勝</span>
          <span className="text-center">分</span>
          <span className="text-center">敗</span>
          <span className="text-center">得失</span>
          <span className="text-center">勝点</span>
          <span className="text-center">直近5試合</span>
        </div>

        {/* 行 */}
        {rows.map((row, i) => (
          <div
            key={row.team_id}
            className="grid items-center px-3 py-2.5 text-sm"
            style={{
              gridTemplateColumns: '2rem 1fr 2.5rem 2.5rem 2.5rem 2.5rem 2.5rem 3rem 5rem',
              backgroundColor: i % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-primary)',
              borderTop: '1px solid var(--border-color)',
              gap: '0',
            }}
          >
            <div className="flex items-center gap-0.5">
              <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{row.rank}</span>
              {row.prev_rank && row.prev_rank !== row.rank && (
                <span className="text-xs leading-none" style={{ color: row.prev_rank > row.rank ? 'var(--accent)' : 'var(--danger)' }}>
                  {row.prev_rank > row.rank ? '↑' : '↓'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
<Link href={`/team/${row.team_id}`} className="truncate font-medium" style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>
                {row.short_name ?? row.name_ja}
              </Link>
            </div>
            <span className="text-center text-xs" style={{ color: 'var(--text-secondary)' }}>{row.played}</span>
            <span className="text-center text-xs" style={{ color: 'var(--text-primary)' }}>{row.win}</span>
            <span className="text-center text-xs" style={{ color: 'var(--text-secondary)' }}>{row.draw}</span>
            <span className="text-center text-xs" style={{ color: 'var(--text-secondary)' }}>{row.lose}</span>
            <span className="text-center text-xs" style={{ color: row.goals_diff > 0 ? 'var(--accent)' : row.goals_diff < 0 ? 'var(--danger)' : 'var(--text-secondary)' }}>
              {row.goals_diff > 0 ? `+${row.goals_diff}` : row.goals_diff}
            </span>
            <span className="text-center text-sm font-bold" style={{ color: 'var(--accent)' }}>{row.points}</span>
            <div className="flex justify-center">
              <FormBadges form={row.form} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default async function StandingsPage() {
  const rows = await getStandings()

  if (rows.length === 0) {
    return (
      <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
        <p className="text-lg mb-2">順位データがまだありません</p>
        <p className="text-sm"><a href="/admin" style={{ color: 'var(--accent)' }}>/admin</a> から「順位表を同期」を実行してください</p>
      </div>
    )
  }

  const east = rows.filter(r => r.group_name === 'EAST')
  const west = rows.filter(r => r.group_name === 'WEST')

  return (
    <div>
      <h1 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>順位表 2026</h1>
      {east.length > 0 && <StandingsTable title="EASTグループ" rows={east} />}
      {west.length > 0 && <StandingsTable title="WESTグループ" rows={west} />}
    </div>
  )
}
