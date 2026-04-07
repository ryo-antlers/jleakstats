import sql from '@/lib/db'

export async function GET() {
  const [fixtures, teams] = await Promise.all([
    sql`
      SELECT home_team_id, away_team_id, home_score, away_score,
             home_penalty, away_penalty, status
      FROM fixtures
      WHERE season = 2026 AND status IN ('FT', 'AET', 'PEN')
    `,
    sql`
      SELECT id, name_ja, short_name, abbr, color_primary, group_name
      FROM teams_master
      WHERE category = 'J1'
      ORDER BY name_ja
    `,
  ])

  const stats = {}
  for (const t of teams) {
    stats[t.id] = { team: t, played: 0, win: 0, draw: 0, lose: 0, gf: 0, ga: 0, points: 0 }
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

    if (hs > as_) {
      stats[h].win++; stats[a].lose++; stats[h].points += 3
    } else if (hs < as_) {
      stats[a].win++; stats[h].lose++; stats[a].points += 3
    } else if (isPK) {
      if (hPK > aPK) {
        stats[h].win++; stats[a].lose++; stats[h].points += 2; stats[a].points += 1
      } else {
        stats[a].win++; stats[h].lose++; stats[a].points += 2; stats[h].points += 1
      }
    } else {
      stats[h].draw++; stats[a].draw++; stats[h].points += 1; stats[a].points += 1
    }
  }

  const byGroup = {}
  for (const s of Object.values(stats)) {
    const g = s.team.group_name
    if (!byGroup[g]) byGroup[g] = []
    byGroup[g].push({ ...s, gd: s.gf - s.ga })
  }

  for (const g of Object.keys(byGroup)) {
    byGroup[g].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      if (b.gd !== a.gd) return b.gd - a.gd
      return b.gf - a.gf
    })
    byGroup[g].forEach((r, i) => r.rank = i + 1)
  }

  return Response.json({ standings: byGroup })
}
