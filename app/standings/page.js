import sql from '@/lib/db'
import Link from 'next/link'

async function getFixtures() {
  return await sql`
    SELECT f.id, f.home_team_id, f.away_team_id,
           f.home_score, f.away_score, f.home_penalty, f.away_penalty,
           f.status, f.date
    FROM fixtures f
    WHERE f.season = 2026 AND f.status IN ('FT', 'AET', 'PEN')
    ORDER BY f.date ASC
  `.catch(() => [])
}

async function getTeams() {
  return await sql`
    SELECT id, name_ja, short_name, color_primary, group_name
    FROM teams_master
    WHERE group_name IN ('EAST', 'WEST')
    ORDER BY group_name, name_ja
  `.catch(() => [])
}

function buildStandings(fixtures, teams) {
  const stats = {}
  const formMap = {}

  for (const t of teams) {
    stats[t.id] = { team: t, played: 0, win: 0, draw: 0, lose: 0, gf: 0, ga: 0, points: 0 }
    formMap[t.id] = []
  }

  for (const f of fixtures) {
    const h = f.home_team_id, a = f.away_team_id
    if (!stats[h] || !stats[a]) continue

    const hs = Number(f.home_score), as_ = Number(f.away_score)
    const isPK = f.status === 'PEN' && f.home_penalty != null && f.away_penalty != null
    const hPK = isPK ? Number(f.home_penalty) : null
    const aPK = isPK ? Number(f.away_penalty) : null

    stats[h].played++; stats[a].played++
    stats[h].gf += hs; stats[h].ga += as_
    stats[a].gf += as_; stats[a].ga += hs

    let hResult, aResult
    if (hs > as_) {
      stats[h].win++; stats[a].lose++
      stats[h].points += 3
      hResult = 'W'; aResult = 'L'
    } else if (hs < as_) {
      stats[a].win++; stats[h].lose++
      stats[a].points += 3
      hResult = 'L'; aResult = 'W'
    } else if (isPK) {
      if (hPK > aPK) {
        stats[h].win++; stats[a].lose++
        stats[h].points += 2; stats[a].points += 1
        hResult = 'W'; aResult = 'L'
      } else {
        stats[a].win++; stats[h].lose++
        stats[a].points += 2; stats[h].points += 1
        hResult = 'L'; aResult = 'W'
      }
    } else {
      stats[h].draw++; stats[a].draw++
      stats[h].points += 1; stats[a].points += 1
      hResult = 'D'; aResult = 'D'
    }

    formMap[h].push(hResult)
    formMap[a].push(aResult)
  }

  const result = Object.values(stats).map(s => ({
    ...s,
    gd: s.gf - s.ga,
    form: formMap[s.team.id].slice(-5).join(''),
  }))

  const byGroup = {}
  for (const r of result) {
    const g = r.team.group_name
    if (!byGroup[g]) byGroup[g] = []
    byGroup[g].push(r)
  }

  for (const g of Object.keys(byGroup)) {
    byGroup[g].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      if (b.gd !== a.gd) return b.gd - a.gd
      return b.gf - a.gf
    })
    byGroup[g].forEach((r, i) => r.rank = i + 1)
  }

  return byGroup
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
        <div className="grid text-xs font-medium px-3 py-2" style={{
          backgroundColor: 'var(--bg-tertiary)',
          color: 'var(--text-secondary)',
          gridTemplateColumns: '2rem 1fr 2.5rem 2.5rem 2.5rem 2.5rem 2.5rem 3rem 5rem',
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
        {rows.map((row, i) => (
          <div key={row.team.id} className="grid items-center px-3 py-2.5 text-sm" style={{
            gridTemplateColumns: '2rem 1fr 2.5rem 2.5rem 2.5rem 2.5rem 2.5rem 3rem 5rem',
            backgroundColor: i % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-primary)',
            borderTop: '1px solid var(--border-color)',
          }}>
            <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{row.rank}</span>
            <div className="flex items-center gap-1.5 min-w-0">
              <Link href={`/team/${row.team.id}`} className="truncate font-medium" style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>
                {row.team.short_name ?? row.team.name_ja}
              </Link>
            </div>
            <span className="text-center text-xs" style={{ color: 'var(--text-secondary)' }}>{row.played}</span>
            <span className="text-center text-xs" style={{ color: 'var(--text-primary)' }}>{row.win}</span>
            <span className="text-center text-xs" style={{ color: 'var(--text-secondary)' }}>{row.draw}</span>
            <span className="text-center text-xs" style={{ color: 'var(--text-secondary)' }}>{row.lose}</span>
            <span className="text-center text-xs" style={{ color: row.gd > 0 ? 'var(--accent)' : row.gd < 0 ? 'var(--danger)' : 'var(--text-secondary)' }}>
              {row.gd > 0 ? `+${row.gd}` : row.gd}
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
  const [fixtures, teams] = await Promise.all([getFixtures(), getTeams()])
  const byGroup = buildStandings(fixtures, teams)

  const east = byGroup['EAST'] ?? []
  const west = byGroup['WEST'] ?? []

  if (east.length === 0 && west.length === 0) {
    return (
      <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
        <p className="text-lg mb-2">試合データがまだありません</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>順位表 2026</h1>
      {east.length > 0 && <StandingsTable title="EASTグループ" rows={east} />}
      {west.length > 0 && <StandingsTable title="WESTグループ" rows={west} />}
    </div>
  )
}
