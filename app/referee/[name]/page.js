import sql from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import RefereeTabs from './referee-tabs'

const leagueLabel = (id) => id === 1 ? 'J1' : id === 2 ? 'J2' : id === 3 ? 'J3' : id === 98 ? 'J1特別' : id === 100 ? 'カップ' : `L${id}`

// 担当試合の概要 + リーグ別内訳
async function getRefereeOverview(name) {
  const rows = await sql`
    SELECT
      f.league_id,
      COUNT(*)::int AS games,
      MIN(f.season)::int AS first_season,
      MAX(f.season)::int AS last_season
    FROM fixtures f
    WHERE f.referee_ja_official = ${name}
    GROUP BY f.league_id
    ORDER BY games DESC
  `.catch(() => [])
  return rows
}

// カードイベント集計（Yellow / Red / Yellow Red）
async function getRefereeCardSummary(name) {
  const rows = await sql`
    SELECT
      fe.detail,
      COUNT(*)::int AS n
    FROM fixture_events fe
    JOIN fixtures f ON fe.fixture_id = f.id
    WHERE f.referee_ja_official = ${name} AND fe.type = 'Card'
    GROUP BY fe.detail
  `.catch(() => [])
  return rows
}

// 担当試合一覧
async function getRefereeFixtures(name) {
  return await sql`
    SELECT f.id, f.date, f.season, f.league_id, f.round_number, f.stage_ja,
      f.home_team_id, f.away_team_id, f.home_score, f.away_score,
      f.home_penalty, f.away_penalty, f.status, f.attendance, f.venue_name_ja,
      ht.name_ja AS home, ht.color_primary AS home_color,
      at.name_ja AS away, at.color_primary AS away_color
    FROM fixtures f
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    WHERE f.referee_ja_official = ${name}
    ORDER BY f.date DESC
  `.catch(() => [])
}

// チーム別: この審判のもとでの W/D/L + 警告/退場
async function getRefereeByTeam(name) {
  return await sql`
    WITH ref_fixtures AS (
      SELECT f.id, f.home_team_id, f.away_team_id,
        f.home_score, f.away_score, f.home_penalty, f.away_penalty, f.status
      FROM fixtures f
      WHERE f.referee_ja_official = ${name}
        AND f.status IN ('FT','AET','PEN')
    ),
    team_results AS (
      SELECT t.id AS team_id,
        COUNT(*)::int AS games,
        SUM(CASE
          WHEN rf.home_team_id = t.id AND rf.home_score > rf.away_score THEN 1
          WHEN rf.away_team_id = t.id AND rf.away_score > rf.home_score THEN 1
          ELSE 0 END)::int AS wins,
        SUM(CASE
          WHEN rf.home_score = rf.away_score AND rf.status IN ('FT','AET') THEN 1
          ELSE 0 END)::int AS draws,
        SUM(CASE
          WHEN rf.home_team_id = t.id AND rf.home_score < rf.away_score THEN 1
          WHEN rf.away_team_id = t.id AND rf.away_score < rf.home_score THEN 1
          ELSE 0 END)::int AS losses
      FROM teams_master t
      JOIN ref_fixtures rf ON (rf.home_team_id = t.id OR rf.away_team_id = t.id)
      GROUP BY t.id
    ),
    team_cards AS (
      SELECT fe.team_id,
        COUNT(*) FILTER (WHERE fe.detail = 'Yellow Card')::int AS yellows,
        COUNT(*) FILTER (WHERE fe.detail = 'Red Card')::int AS reds,
        COUNT(*) FILTER (WHERE fe.detail = 'Yellow Red Card')::int AS yellow_reds
      FROM fixture_events fe
      JOIN ref_fixtures rf ON fe.fixture_id = rf.id
      WHERE fe.type = 'Card'
      GROUP BY fe.team_id
    )
    SELECT t.id, t.name_ja, t.abbr, t.color_primary,
      tr.games, tr.wins, tr.draws, tr.losses,
      COALESCE(tc.yellows, 0) AS yellows,
      COALESCE(tc.reds, 0) AS reds,
      COALESCE(tc.yellow_reds, 0) AS yellow_reds
    FROM team_results tr
    JOIN teams_master t ON t.id = tr.team_id
    LEFT JOIN team_cards tc ON tc.team_id = t.id
    ORDER BY tr.games DESC, tr.wins DESC
  `.catch(() => [])
}

// 選手別: この審判から最も多くカードを受けた選手
async function getRefereeByPlayer(name) {
  return await sql`
    SELECT fe.player_id,
      COALESCE(pm.name_ja, pm.name_en, fe.player_name_ja, fe.player_name_en) AS player_name,
      fe.team_id,
      tm.name_ja AS team_name, tm.color_primary AS team_color,
      COUNT(*) FILTER (WHERE fe.detail = 'Yellow Card')::int AS yellows,
      COUNT(*) FILTER (WHERE fe.detail = 'Yellow Red Card')::int AS yellow_reds,
      COUNT(*) FILTER (WHERE fe.detail = 'Red Card')::int AS reds,
      (COUNT(*) FILTER (WHERE fe.detail IN ('Yellow Card','Yellow Red Card')) + COUNT(*) FILTER (WHERE fe.detail = 'Red Card'))::int AS total
    FROM fixture_events fe
    JOIN fixtures f ON fe.fixture_id = f.id
    LEFT JOIN players_master pm ON fe.player_id = pm.id
    LEFT JOIN teams_master tm ON fe.team_id = tm.id
    WHERE f.referee_ja_official = ${name} AND fe.type = 'Card'
    GROUP BY fe.player_id, pm.name_ja, pm.name_en, fe.player_name_ja, fe.player_name_en, fe.team_id, tm.name_ja, tm.color_primary
    HAVING COUNT(*) >= 1
    ORDER BY total DESC, reds DESC
    LIMIT 80
  `.catch(() => [])
}

export default async function RefereePage({ params }) {
  const { name: rawName } = await params
  const name = decodeURIComponent(rawName)

  const [overview, cardSummary, fixtures, byTeam, byPlayer] = await Promise.all([
    getRefereeOverview(name),
    getRefereeCardSummary(name),
    getRefereeFixtures(name),
    getRefereeByTeam(name),
    getRefereeByPlayer(name),
  ])

  if (overview.length === 0 && fixtures.length === 0) notFound()

  const totalGames = overview.reduce((s, r) => s + r.games, 0)
  const firstSeason = Math.min(...overview.map(r => r.first_season))
  const lastSeason  = Math.max(...overview.map(r => r.last_season))
  const yellows = cardSummary.find(c => c.detail === 'Yellow Card')?.n ?? 0
  const reds    = cardSummary.find(c => c.detail === 'Red Card')?.n ?? 0
  const yellowReds = cardSummary.find(c => c.detail === 'Yellow Red Card')?.n ?? 0
  const totalCards = yellows + reds + yellowReds
  const cardsPerGame = totalGames > 0 ? (totalCards / totalGames).toFixed(2) : '-'
  const reddPerGame  = totalGames > 0 ? ((reds + yellowReds) / totalGames).toFixed(2) : '-'

  // === 概要タブ ===
  const summaryJsx = (
    <div style={{ marginBottom: 40 }}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
        {[
          { label: 'GAMES', value: totalGames },
          { label: 'YEARS', value: `${firstSeason}-${lastSeason}` },
          { label: 'CARDS/G', value: cardsPerGame },
          { label: 'YELLOW', value: yellows },
          { label: 'YELLOW-RED', value: yellowReds },
          { label: 'RED', value: reds },
          { label: 'RED/G', value: reddPerGame },
        ].map(({ label, value }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{value}</p>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginBottom: 12 }}>BY LEAGUE</p>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <th style={thStyle('left')}>LEAGUE</th>
              <th style={thStyle()}>GAMES</th>
              <th style={thStyle()}>FROM</th>
              <th style={thStyle()}>TO</th>
            </tr>
          </thead>
          <tbody>
            {overview.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '8px', color: '#fff' }}>{leagueLabel(r.league_id)}</td>
                <td style={tdStyle('rgba(255,255,255,0.85)', true)}>{r.games}</td>
                <td style={tdStyle()}>{r.first_season}</td>
                <td style={tdStyle()}>{r.last_season}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  // === 担当試合タブ ===
  const fixturesJsx = fixtures.length > 0 ? (
    <div style={{ marginBottom: 40 }}>
      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginBottom: 12 }}>
        ALL MATCHES ({fixtures.length})
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%', whiteSpace: 'nowrap' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <th style={thStyle('left')}>DATE</th>
              <th style={thStyle()}>LG</th>
              <th style={thStyle()}>R</th>
              <th style={thStyle('left')}>HOME</th>
              <th style={thStyle()}>SCORE</th>
              <th style={thStyle('left')}>AWAY</th>
              <th style={thStyle('left')}>VENUE</th>
              <th style={thStyle()}>ATT</th>
            </tr>
          </thead>
          <tbody>
            {fixtures.map((m, i) => {
              const d = new Date(m.date)
              const dateStr = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
              const isPK = m.status === 'PEN' && m.home_penalty != null
              const rowBg = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'
              return (
                <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: rowBg }}>
                  <td style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.6)' }}>{dateStr}</td>
                  <td style={tdStyle('rgba(255,255,255,0.4)')}>{leagueLabel(m.league_id)}</td>
                  <td style={tdStyle('rgba(255,255,255,0.4)')}>{m.round_number ?? '-'}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <Link href={`/team/${m.home_team_id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: m.home_color ?? '#555', flexShrink: 0 }} />
                      <span style={{ color: '#fff' }}>{m.home}</span>
                    </Link>
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                    <Link href={`/fixture/${m.id}`} style={{ textDecoration: 'none', color: '#fff', fontWeight: 700 }}>
                      {m.home_score}-{m.away_score}{isPK ? ` (PK ${m.home_penalty}-${m.away_penalty})` : ''}
                    </Link>
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <Link href={`/team/${m.away_team_id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: m.away_color ?? '#555', flexShrink: 0 }} />
                      <span style={{ color: '#fff' }}>{m.away}</span>
                    </Link>
                  </td>
                  <td style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.55)' }}>{m.venue_name_ja ?? '-'}</td>
                  <td style={tdStyle()}>{m.attendance ? Number(m.attendance).toLocaleString() : '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  ) : null

  // === チーム別タブ ===
  const byTeamJsx = byTeam.length > 0 ? (
    <div style={{ marginBottom: 40 }}>
      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginBottom: 12 }}>
        BY TEAM ({byTeam.length})
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', whiteSpace: 'nowrap' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <th style={thStyle('left')}>TEAM</th>
              <th style={thStyle()}>P</th>
              <th style={thStyle()}>W</th>
              <th style={thStyle()}>D</th>
              <th style={thStyle()}>L</th>
              <th style={thStyle()}>WIN%</th>
              <th style={thStyle()}>YEL</th>
              <th style={thStyle()}>YR</th>
              <th style={thStyle()}>RED</th>
            </tr>
          </thead>
          <tbody>
            {byTeam.map((t, i) => {
              const winPct = t.games > 0 ? Math.round(t.wins / t.games * 100) : 0
              return (
                <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '8px' }}>
                    <Link href={`/team/${t.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: t.color_primary ?? '#555' }} />
                      <span style={{ color: '#fff' }}>{t.name_ja}</span>
                    </Link>
                  </td>
                  <td style={tdStyle('rgba(255,255,255,0.85)', true)}>{t.games}</td>
                  <td style={tdStyle('#3d9e50', true)}>{t.wins}</td>
                  <td style={tdStyle('rgba(255,255,255,0.55)')}>{t.draws}</td>
                  <td style={tdStyle('#e87979', true)}>{t.losses}</td>
                  <td style={tdStyle('rgba(255,255,255,0.55)')}>{winPct}%</td>
                  <td style={tdStyle('#e9c93a')}>{t.yellows}</td>
                  <td style={tdStyle('#e9933a')}>{t.yellow_reds || '-'}</td>
                  <td style={tdStyle('#e85353')}>{t.reds || '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  ) : null

  // === 選手別タブ ===
  const byPlayerJsx = byPlayer.length > 0 ? (
    <div style={{ marginBottom: 40 }}>
      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginBottom: 12 }}>
        TOP CARDED PLAYERS ({byPlayer.length})
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', whiteSpace: 'nowrap' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <th style={thStyle('left')}>PLAYER</th>
              <th style={thStyle('left')}>TEAM</th>
              <th style={thStyle()}>YEL</th>
              <th style={thStyle()}>YR</th>
              <th style={thStyle()}>RED</th>
              <th style={thStyle()}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {byPlayer.map((p, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '8px' }}>
                  {p.player_id ? (
                    <Link href={`/player/${p.player_id}`} style={{ color: '#fff', textDecoration: 'none' }}>{p.player_name ?? '?'}</Link>
                  ) : (
                    <span style={{ color: '#fff' }}>{p.player_name ?? '?'}</span>
                  )}
                </td>
                <td style={{ padding: '8px' }}>
                  {p.team_id ? (
                    <Link href={`/team/${p.team_id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: p.team_color ?? '#555', flexShrink: 0 }} />
                      <span style={{ color: 'rgba(255,255,255,0.7)' }}>{p.team_name ?? '?'}</span>
                    </Link>
                  ) : '-'}
                </td>
                <td style={tdStyle('#e9c93a')}>{p.yellows || '-'}</td>
                <td style={tdStyle('#e9933a')}>{p.yellow_reds || '-'}</td>
                <td style={tdStyle('#e85353')}>{p.reds || '-'}</td>
                <td style={tdStyle('rgba(255,255,255,0.85)', true)}>{p.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ) : null

  return (
    <div>
      {/* ヘッダー */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', marginBottom: 4 }}>REFEREE</p>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: '#fff', marginBottom: 0, letterSpacing: '0.03em' }}>
          {name}
        </h1>
        <div style={{ backgroundColor: '#888', height: 6, borderRadius: 2 }} />
      </div>

      <RefereeTabs
        tabs={[
          { key: 'summary',  label: '概要',     content: summaryJsx },
          { key: 'matches',  label: '担当試合', content: fixturesJsx },
          { key: 'byteam',   label: 'チーム別', content: byTeamJsx },
          { key: 'byplayer', label: '選手別',   content: byPlayerJsx },
        ]}
        defaultKey="summary"
      />
    </div>
  )
}

function thStyle(align = 'center') {
  return {
    padding: '6px 8px',
    color: 'rgba(255,255,255,0.3)',
    fontWeight: 400,
    textAlign: align,
    fontSize: 10,
    letterSpacing: '0.05em',
  }
}

function tdStyle(color, bold) {
  return {
    padding: '6px 8px',
    textAlign: 'center',
    color: color ?? 'rgba(255,255,255,0.5)',
    fontWeight: bold ? 700 : 400,
  }
}
