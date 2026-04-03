import sql from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'

async function getPlayer(id) {
  const rows = await sql`
    SELECT pm.*, tm.name_ja AS team_name, tm.color_primary AS team_color, tm.abbr AS team_abbr
    FROM players_master pm
    LEFT JOIN teams_master tm ON pm.team_id = tm.id
    WHERE pm.id = ${id}
  `.catch(() => [])
  return rows[0] ?? null
}

async function getPlayerMatches(playerId) {
  return await sql`
    SELECT
      fps.*,
      fl.is_starter,
      f.id AS fixture_id, f.date, f.round_number, f.status,
      f.home_team_id, f.away_team_id,
      f.home_score, f.away_score, f.home_penalty, f.away_penalty,
      ht.name_ja AS home_name, ht.abbr AS home_abbr, ht.color_primary AS home_color,
      at.name_ja AS away_name, at.abbr AS away_abbr, at.color_primary AS away_color,
      (SELECT AVG(CAST(fps2.rating AS numeric))
       FROM fixture_player_stats fps2
       WHERE fps2.fixture_id = fps.fixture_id
         AND fps2.team_id = fps.team_id
         AND fps2.rating IS NOT NULL
         AND CAST(fps2.rating AS numeric) > 0) AS team_avg_rating
    FROM fixture_player_stats fps
    JOIN fixtures f ON fps.fixture_id = f.id
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    LEFT JOIN fixture_lineups fl ON fl.fixture_id = fps.fixture_id AND fl.player_id = fps.player_id
    WHERE fps.player_id = ${playerId}
      AND f.season = 2026
      AND f.status IN ('FT', 'AET', 'PEN')
    ORDER BY f.date DESC
  `.catch(() => [])
}

async function getTeamPlayersStats(teamId) {
  return await sql`
    SELECT
      fps.player_id,
      pm.name_ja,
      MAX(fps.number) AS number,
      COUNT(*) AS games_count,
      SUM(CASE WHEN f.status = 'AET' THEN fps.minutes ELSE LEAST(fps.minutes, 90) END) AS total_minutes,
      AVG(CAST(fps.rating AS numeric)) FILTER (WHERE fps.rating IS NOT NULL AND CAST(fps.rating AS numeric) > 0) AS avg_rating
    FROM fixture_player_stats fps
    JOIN fixtures f ON fps.fixture_id = f.id
    JOIN players_master pm ON fps.player_id = pm.id
    WHERE fps.team_id = ${teamId}
      AND f.season = 2026
      AND f.status IN ('FT', 'AET', 'PEN')
    GROUP BY fps.player_id, pm.name_ja
    HAVING SUM(fps.minutes) > 0
    ORDER BY total_minutes DESC
  `.catch(() => [])
}

function textColor(hex) {
  if (!hex) return '#fff'
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return (r*299 + g*587 + b*114) / 1000 > 150 ? '#1a1a1a' : '#fff'
}

function ScatterChart({ teamStats, playerId, color }) {
  const withRating = teamStats
    .filter(p => p.avg_rating && Number(p.total_minutes) > 0)
    .map(p => {
      const m = Number(p.total_minutes)
      const rem = m % 90
      // 90の余りが15以下はPK戦のロスタイムとみなして切り捨て
      return { ...p, total_minutes: rem > 0 && rem <= 15 ? m - rem : m }
    })
  if (withRating.length === 0) return null

  const W = 600, H = 280
  const padL = 32, padR = 16, padT = 20, padB = 28
  const chartW = W - padL - padR, chartH = H - padT - padB
  const R = 11 // dot radius

  const maxMin = Math.max(...withRating.map(p => Number(p.total_minutes)), 1)
  const minR = 5.5, maxR = 9.5
  const yTicks = [6, 6.5, 7, 7.5, 8, 8.5, 9]

  const x = (min) => padL + (Number(min) / maxMin) * chartW
  const y = (r) => padT + (1 - (r - minR) / (maxR - minR)) * chartH

  const others = withRating.filter(p => Number(p.player_id) !== playerId)
  const focus = withRating.find(p => Number(p.player_id) === playerId)

  const focusCx = focus ? x(focus.total_minutes) : null
  const focusCy = focus ? y(parseFloat(focus.avg_rating)) : null
  const focusNum = focus ? (focus.number ?? '') : ''

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {/* grid + Y labels */}
      {yTicks.map(r => (
        <g key={r}>
          <line x1={padL} x2={W - padR} y1={y(r)} y2={y(r)}
            stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
          <text x={padL - 4} y={y(r) + 3} textAnchor="end"
            style={{ fontSize: 7, fill: 'rgba(255,255,255,0.2)', fontFamily: 'inherit' }}>{r.toFixed(1)}</text>
        </g>
      ))}
      {/* axes */}
      <line x1={padL} x2={padL} y1={padT} y2={H - padB}
        stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
      <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB}
        stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
      <text x={(padL + W - padR) / 2} y={H - 6} textAnchor="middle"
        style={{ fontSize: 7, fill: 'rgba(255,255,255,0.2)', fontFamily: 'inherit' }}>MINUTES</text>
      {/* other players — white dots with jersey number */}
      {others.map(p => {
        const cx = x(p.total_minutes), cy = y(parseFloat(p.avg_rating))
        return (
          <g key={p.player_id}>
            <circle cx={cx} cy={cy} r={R} fill="rgba(255,255,255,0.8)" />
            <text x={cx} y={cy + 3.5} textAnchor="middle"
              style={{ fontSize: 10, fill: '#1a1a1a', fontFamily: 'inherit', fontWeight: 700 }}>{p.number ?? ''}</text>
          </g>
        )
      })}
      {/* focus player — club color dot with jersey number */}
      {focus && (
        <g>
          <circle cx={focusCx} cy={focusCy} r={R} fill={color} />
          <text x={focusCx} y={focusCy + 3.5} textAnchor="middle"
            style={{ fontSize: 10, fill: '#fff', fontFamily: 'inherit', fontWeight: 700 }}>{focusNum}</text>
        </g>
      )}
    </svg>
  )
}

export default async function PlayerPage({ params }) {
  const { id } = await params
  const playerId = parseInt(id)
  const player = await getPlayer(playerId)
  if (!player) notFound()
  const [matches, teamStats] = await Promise.all([
    getPlayerMatches(playerId),
    getTeamPlayersStats(player.team_id),
  ])

  const color = player.team_color ?? '#555'

  // Season totals
  const cappedMin = (m) => m.status === 'AET' ? (Number(m.minutes) || 0) : Math.min(Number(m.minutes) || 0, 90)
  const totalMinutes = matches.reduce((s, m) => s + cappedMin(m), 0)
  const totalGoals = matches.reduce((s, m) => s + (Number(m.goals) || 0), 0)
  const totalAssists = matches.reduce((s, m) => s + (Number(m.assists) || 0), 0)
  const rated = matches.filter(m => m.rating && parseFloat(m.rating) > 0)
  const avgRating = rated.length > 0
    ? (rated.reduce((s, m) => s + parseFloat(m.rating), 0) / rated.length).toFixed(2)
    : null
  const totalShots = matches.reduce((s, m) => s + (Number(m.shots_total) || 0), 0)
  const totalPasses = matches.reduce((s, m) => s + (Number(m.passes_total) || 0), 0)
  const totalKeyPasses = matches.reduce((s, m) => s + (Number(m.passes_key) || 0), 0)
  const totalStarts = matches.filter(m => m.is_starter).length

  const VDivider = () => (
    <div style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'stretch', margin: '0 4px' }} />
  )

  // table divider column
  const TDDiv = () => (
    <td style={{ width: 1, padding: 0, backgroundColor: 'rgba(255,255,255,0.08)' }} />
  )

  return (
    <div>
      {/* ヘッダー */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: '#fff', marginBottom: 0, letterSpacing: '0.03em' }}>
          {player.name_en ?? player.name_ja}
        </h1>
        <div style={{ backgroundColor: color, height: 6, borderRadius: 2 }} />
      </div>

      {/* シーズンサマリー */}
      {matches.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 36, flexWrap: 'wrap' }}>
          {player.number && (
            <>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.08em', marginBottom: 2 }}>#</p>
                <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{player.number}</p>
              </div>
              <VDivider />
            </>
          )}
          {[
            { label: 'GAMES', value: matches.length },
            { label: 'START', value: totalStarts },
            { label: 'MIN', value: totalMinutes },
          ].map(({ label, value }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</p>
              <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{value}</p>
            </div>
          ))}
          <VDivider />
          {[
            { label: 'SHOTS', value: totalShots || '-' },
            { label: 'GOALS', value: totalGoals },
            { label: 'PASSES', value: totalPasses || '-' },
            { label: 'KEY PASSES', value: totalKeyPasses || '-' },
            { label: 'ASSISTS', value: totalAssists },
          ].map(({ label, value }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</p>
              <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{value ?? '-'}</p>
            </div>
          ))}
          <VDivider />
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.08em', marginBottom: 2 }}>RATING</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{avgRating ?? '-'}</p>
          </div>
        </div>
      )}

      {/* 散布図 */}
      {teamStats.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginBottom: 8 }}>RATING</p>
          <div style={{ width: '75%', margin: '0 auto' }}>
            <ScatterChart teamStats={teamStats} playerId={playerId} color={color} />
          </div>
        </div>
      )}

      {/* 試合ログ */}
      {matches.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginBottom: 12 }}>MATCH LOG</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11, whiteSpace: 'nowrap', width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {/* match info */}
                  <th style={thStyle()}></th>
                  <th style={thStyle()}>R</th>
                  <th style={thStyle()}>DATE</th>
                  <th style={thStyle()}>H/A</th>
                  <th style={thStyle('left')}>OPP</th>
                  <th style={thStyle()}>SCORE</th>
                  {/* basic stats */}
                  <th style={thStyle()}>MIN</th>
                  <th style={thStyle()}>G</th>
                  <th style={thStyle()}>A</th>
                  {/* divider */}
                  <th style={{ width: 1, padding: 0 }} />
                  {/* passing */}
                  <th style={thStyle()}>PASS</th>
                  <th style={thStyle()}>PASS%</th>
                  <th style={thStyle()}>KEY</th>
                  {/* defensive */}
                  <th style={thStyle()}>TKL</th>
                  <th style={thStyle()}>BLK</th>
                  <th style={thStyle()}>INT</th>
                  <th style={thStyle()}>DUL</th>
                  <th style={thStyle()}>DUL%</th>
                  {/* divider */}
                  <th style={{ width: 1, padding: 0 }} />
                  <th style={thStyle()}>RATING</th>
                  <th style={thStyle()}>TEAM AVG</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m, i) => {
                  const isHome = Number(m.home_team_id) === Number(player.team_id)
                  const myScore = isHome ? Number(m.home_score) : Number(m.away_score)
                  const oppScore = isHome ? Number(m.away_score) : Number(m.home_score)
                  const isPK = m.status === 'PEN' && m.home_penalty != null
                  const myPK = isPK ? (isHome ? Number(m.home_penalty) : Number(m.away_penalty)) : null
                  const oppPK = isPK ? (isHome ? Number(m.away_penalty) : Number(m.home_penalty)) : null
                  const result = myScore > oppScore ? 'W' : myScore < oppScore ? 'L'
                    : isPK ? (myPK > oppPK ? 'W' : 'L') : 'D'
                  const resultColor = result === 'W' ? color : result === 'L' ? '#555' : '#444'
                  const oppName = isHome ? m.away_name : m.home_name
                  const oppColor = isHome ? m.away_color : m.home_color
                  const oppId = isHome ? m.away_team_id : m.home_team_id
                  const d = new Date(m.date)
                  const jst = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
                  const dateStr = `${jst.getMonth()+1}/${jst.getDate()}`
                  const rating = m.rating ? parseFloat(m.rating).toFixed(1) : '-'
                  const ratingNum = parseFloat(rating)
                  const ratingColor = ratingNum >= 7.5 ? '#3d9e50' : ratingNum >= 6.5 ? '#fff' : 'rgba(255,255,255,0.4)'
                  const duels = Number(m.duels_total) || 0
                  const duelsWon = Number(m.duels_won) || 0
                  const duelPct = duels > 0 ? Math.round(duelsWon / duels * 100) + '%' : '-'
                  const passTotal = Number(m.passes_total) || 0
                  const passAcc = passTotal > 0 && m.passes_accuracy != null
                    ? Math.round(Number(m.passes_accuracy) / passTotal * 100) + '%'
                    : '-'
                  const rowBg = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'

                  return (
                    <tr key={m.fixture_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: rowBg }}>
                      {/* result badge */}
                      <td style={{ padding: '6px 6px 6px 0' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 18, height: 18, borderRadius: 3,
                          backgroundColor: resultColor, fontSize: 9, fontWeight: 700, color: '#fff',
                        }}>{result}</span>
                      </td>
                      <td style={tdStyle()}>{m.round_number}</td>
                      <td style={tdStyle()}>{dateStr}</td>
                      <td style={tdStyle()}>{isHome ? 'H' : 'A'}</td>
                      <td style={{ padding: '6px 12px 6px 4px' }}>
                        <Link href={`/team/${oppId}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: oppColor ?? '#555', flexShrink: 0 }} />
                          <span style={{ color: '#fff' }}>{oppName}</span>
                        </Link>
                      </td>
                      <td style={tdStyle()}>
                        <Link href={`/fixture/${m.fixture_id}`} style={{ textDecoration: 'none', color: 'rgba(255,255,255,0.6)' }}>
                          {myScore}-{oppScore}{isPK ? ' (PK)' : ''}
                        </Link>
                      </td>
                      {/* basic stats */}
                      <td style={tdStyle('rgba(255,255,255,0.8)')}>{m.minutes > 0 ? (m.status === 'AET' ? m.minutes : Math.min(Number(m.minutes), 90)) : '-'}</td>
                      <td style={tdStyle(m.goals > 0 ? '#3d9e50' : undefined, m.goals > 0)}>{m.goals > 0 ? m.goals : '-'}</td>
                      <td style={tdStyle(m.assists > 0 ? '#5b8fd4' : undefined, m.assists > 0)}>{m.assists > 0 ? m.assists : '-'}</td>
                      {/* divider */}
                      <TDDiv />
                      {/* passing */}
                      <td style={tdStyle()}>{m.passes_total > 0 ? m.passes_total : '-'}</td>
                      <td style={tdStyle()}>{passAcc}</td>
                      <td style={tdStyle()}>{m.passes_key > 0 ? m.passes_key : '-'}</td>
                      {/* defensive */}
                      <td style={tdStyle()}>{m.tackles > 0 ? m.tackles : '-'}</td>
                      <td style={tdStyle()}>{m.blocks > 0 ? m.blocks : '-'}</td>
                      <td style={tdStyle()}>{m.interceptions > 0 ? m.interceptions : '-'}</td>
                      <td style={tdStyle()}>{duels > 0 ? duels : '-'}</td>
                      <td style={tdStyle()}>{duelPct}</td>
                      {/* divider */}
                      <TDDiv />
                      <td style={{ padding: '6px 8px', textAlign: 'center', color: ratingColor, fontWeight: rating !== '-' ? 700 : 400 }}>
                        {rating}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', color: 'rgba(255,255,255,0.35)' }}>
                        {m.team_avg_rating ? parseFloat(m.team_avg_rating).toFixed(1) : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {matches.length === 0 && (
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
          2026シーズンのデータがありません
        </p>
      )}
    </div>
  )
}

function thStyle(align = 'center') {
  return {
    padding: '4px 8px',
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
