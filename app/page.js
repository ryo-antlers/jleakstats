import Link from 'next/link'
import sql from '@/lib/db'
import { formatDateJa } from '@/lib/utils'
import GroupTabs from '@/app/components/GroupTabs'
import StandingsChart from '@/app/components/StandingsChart'
import PointsChart from '@/app/components/PointsChart'
import ScatterChart from '@/app/components/ScatterChart'
import HeatmapChart from '@/app/components/HeatmapChart'

const TEAM_ORDER = [
  290, 281, 287, 292, 294, 296, 303, 305, 306, 301, // EAST
  282, 283, 285, 288, 289, 291, 293, 302, 310, 316,  // WEST
]

// ---- データ取得 ----

async function getAllRounds() {
  const rows = await sql`
    SELECT DISTINCT round_number FROM fixtures
    WHERE season = 2026 AND round_number IS NOT NULL
    ORDER BY round_number ASC
  `
  return rows.map(r => r.round_number)
}

async function getCurrentRound(rounds) {
  const row = await sql`
    SELECT round_number FROM fixtures
    WHERE season = 2026 AND status IN ('FT', 'AET', 'PEN', 'LIVE', 'HT')
      AND round_number IS NOT NULL
    GROUP BY round_number
    HAVING COUNT(*) >= 5
    ORDER BY round_number DESC LIMIT 1
  `
  if (row.length > 0) return row[0].round_number
  return rounds[0] ?? 1
}

async function getFixturesByRound(roundNumber) {
  const rows = await sql`
    SELECT
      f.*,
      ht.name_ja AS home_name, ht.short_name AS home_short, ht.abbr AS home_abbr,
      ht.color_primary AS home_color,
      ht.group_name AS home_group,
      at.name_ja AS away_name, at.short_name AS away_short, at.abbr AS away_abbr,
      at.color_primary AS away_color,
      at.group_name AS away_group
    FROM fixtures f
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    WHERE f.season = 2026 AND f.round_number = ${roundNumber}
  `
  return rows.sort((a, b) => {
    const dateDiff = new Date(a.date) - new Date(b.date)
    if (dateDiff !== 0) return dateDiff
    const ai = TEAM_ORDER.indexOf(a.home_team_id)
    const bi = TEAM_ORDER.indexOf(b.home_team_id)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })
}

async function getEarlyFixtures(excludeRounds) {
  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - 3)
  const to = new Date(now)
  to.setDate(to.getDate() + 3)
  const rows = await sql`
    SELECT
      f.*,
      ht.name_ja AS home_name, ht.short_name AS home_short, ht.abbr AS home_abbr,
      ht.color_primary AS home_color, ht.group_name AS home_group,
      at.name_ja AS away_name, at.short_name AS away_short, at.abbr AS away_abbr,
      at.color_primary AS away_color, at.group_name AS away_group
    FROM fixtures f
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    WHERE f.season = 2026
      AND f.date >= ${from.toISOString()}
      AND f.date <= ${to.toISOString()}
      AND f.round_number NOT IN (${excludeRounds[0]}, ${excludeRounds[1] ?? excludeRounds[0]})
  `.catch(() => [])
  return rows.sort((a, b) => new Date(a.date) - new Date(b.date))
}

async function getStandings() {
  return await sql`
    SELECT s.*, tm.name_ja, tm.name_en, tm.short_name, tm.color_primary
    FROM standings s
    LEFT JOIN teams_master tm ON s.team_id = tm.id
    WHERE s.season = 2026
    ORDER BY s.group_name ASC, s.rank ASC
  `.catch(() => [])
}

async function getBestXIPlayers(roundNumber) {
  return await sql`
    SELECT
      fps.player_id, fps.position, fps.rating, fps.minutes,
      fps.goals, fps.assists,
      pm.name_en, pm.name_ja,
      tm.color_primary AS team_color, tm.short_name AS team_short,
      tm.group_name AS team_group
    FROM fixture_player_stats fps
    JOIN fixtures f ON fps.fixture_id = f.id
    LEFT JOIN players_master pm ON fps.player_id = pm.id
    LEFT JOIN teams_master tm ON fps.team_id = tm.id
    WHERE f.season = 2026 AND f.round_number = ${roundNumber}
      AND fps.rating IS NOT NULL
      AND fps.minutes >= 45
    ORDER BY fps.rating DESC
  `.catch(() => [])
}

// ---- ベストイレブン選出ロジック ----

function pickBestXI(players) {
  const byPos = { G: [], D: [], M: [], F: [] }
  for (const p of players) {
    const pos = (p.position ?? '').charAt(0).toUpperCase()
    if (byPos[pos]) byPos[pos].push(p)
  }
  for (const pos of Object.keys(byPos)) {
    byPos[pos].sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating))
  }

  const gk = byPos.G.slice(0, 1)
  if (gk.length === 0) return null

  const selected = {
    D: byPos.D.slice(0, 3),
    M: byPos.M.slice(0, 3),
    F: byPos.F.slice(0, 1),
  }

  const pool = [
    ...byPos.D.slice(3).map(p => ({ ...p, _pos: 'D', _max: 5 })),
    ...byPos.M.slice(3).map(p => ({ ...p, _pos: 'M', _max: 6 })),
    ...byPos.F.slice(1).map(p => ({ ...p, _pos: 'F', _max: 3 })),
  ].sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating))

  let spots = 10 - selected.D.length - selected.M.length - selected.F.length
  for (const p of pool) {
    if (spots === 0) break
    if (selected[p._pos].length < p._max) {
      selected[p._pos].push(p)
      spots--
    }
  }

  const total = gk.length + selected.D.length + selected.M.length + selected.F.length
  if (total < 11) return null

  return { gk, df: selected.D, mf: selected.M, fw: selected.F }
}

function playerDisplayName(p) {
  if (p.name_ja) return p.name_ja
  const parts = (p.name_en ?? '?').split(' ')
  return parts[parts.length - 1]
}

// ---- UIコンポーネント ----

function teamAbbr(short) {
  if (!short) return '---'
  return short.slice(0, 3).toUpperCase()
}


function EarlyFixtureGroup({ fixtures }) {
  if (fixtures.length === 0) return null
  // 節ごとにグループ化
  const groups = {}
  for (const f of fixtures) {
    const key = f.round_number ?? 'unknown'
    if (!groups[key]) groups[key] = { round: f.round_number, items: [] }
    groups[key].items.push(f)
  }
  return (
    <div style={{ marginBottom: 16 }}>
      {Object.values(groups).map((g, i) => (
        <div key={i} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em' }}>ROUND {g.round}</span>
            <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.15)' }} />
          </div>
          <div className="grid-fixtures-5col">
            {g.items.map(f => {
              const isFinished = ['FT', 'AET', 'PEN', 'LIVE', 'HT'].includes(f.status)
              return isFinished
                ? <FixtureCard key={f.id} fixture={f} />
                : <UpcomingFixtureCard key={f.id} fixture={f} />
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function formatUpcomingLabel(dateStr) {
  if (!dateStr) return ''
  const d = new Date(new Date(dateStr).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  const m = d.getMonth() + 1
  const day = d.getDate()
  const dow = days[d.getDay()]
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${m}/${day} ${dow} ${hh}:${mm} KO`
}

function textColor(hex) {
  if (!hex) return '#fff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 150 ? '#2a2a2a' : '#fff'
}

function FixtureCard({ fixture }) {
  const isFinished = ['FT', 'AET', 'PEN'].includes(fixture.status)
  const isLive = fixture.status === 'LIVE' || fixture.status === 'HT'
  const hasScore = isFinished || isLive

  return (
    <Link href={`/fixture/${fixture.id}`} style={{ textDecoration: 'none' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>

        {/* チーム略称 */}
        <div style={{ display: 'flex', width: '100%' }}>
          <span className="fixture-abbr" style={{ flex: 1, fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '0.08em', textAlign: 'center' }}>
            {fixture.home_abbr ?? teamAbbr(fixture.home_short)}
          </span>
          <span className="fixture-abbr" style={{ flex: 1, fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '0.08em', textAlign: 'center' }}>
            {fixture.away_abbr ?? teamAbbr(fixture.away_short)}
          </span>
        </div>

        {/* スコアブロック */}
        {hasScore ? (
          <div style={{ display: 'flex', width: '100%' }}>
            <div className="fixture-score-tile" style={{
              flex: 1, height: 50,
              backgroundColor: fixture.home_color ?? '#444',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 30, fontWeight: 900, color: textColor(fixture.home_color),
            }}>
              {fixture.home_score ?? 0}
            </div>
            <div className="fixture-score-tile" style={{
              flex: 1, height: 50,
              backgroundColor: fixture.away_color ?? '#444',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 30, fontWeight: 900, color: textColor(fixture.away_color),
            }}>
              {fixture.away_score ?? 0}
            </div>
          </div>
        ) : (
          <div style={{
            width: '100%', height: 70,
            backgroundColor: '#2a2a2a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: '#555',
          }}>
            {formatDateJa(fixture.date)}
          </div>
        )}

        {/* PK */}
        {fixture.status === 'PEN' && fixture.home_penalty != null && (
          <span className="pk-score" style={{ fontWeight: 700, color: '#fff' }}>
            {fixture.home_penalty} - {fixture.away_penalty}
          </span>
        )}

        {/* LIVE */}
        {isLive && (
          <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>● LIVE</span>
        )}
      </div>
    </Link>
  )
}

function UpcomingFixtureCard({ fixture }) {
  return (
    <Link href={`/fixture/${fixture.id}`} style={{ textDecoration: 'none' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        {/* チーム略称 */}
        <div style={{ display: 'flex', width: '100%' }}>
          <span className="fixture-abbr" style={{ flex: 1, fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: '0.08em', textAlign: 'center' }}>
            {fixture.home_abbr ?? teamAbbr(fixture.home_short)}
          </span>
          <span className="fixture-abbr" style={{ flex: 1, fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: '0.08em', textAlign: 'center' }}>
            {fixture.away_abbr ?? teamAbbr(fixture.away_short)}
          </span>
        </div>
        {/* カラーブロック（空） */}
        <div style={{ display: 'flex', width: '100%' }}>
          <div style={{ flex: 1, height: 40, backgroundColor: fixture.home_color ?? '#444' }} />
          <div style={{ flex: 1, height: 40, backgroundColor: fixture.away_color ?? '#444' }} />
        </div>
        {/* 日付・時刻 */}
        <span style={{ fontSize: 10, fontWeight: 600, color: '#fff', letterSpacing: '0.05em', marginTop: 2 }}>
          {formatUpcomingLabel(fixture.date)}
        </span>
      </div>
    </Link>
  )
}

function PlayerPin({ player }) {
  const name = playerDisplayName(player)
  const rating = player.rating ? parseFloat(player.rating).toFixed(1) : null
  return (
    <Link href={`/player/${player.player_id}`} style={{ textDecoration: 'none' }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 72 }}>
      <div style={{
        width: 38, height: 38, borderRadius: '50%',
        backgroundColor: player.team_color ?? '#555',
        border: '2px solid rgba(255,255,255,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {rating && (
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
            {rating}
          </span>
        )}
      </div>
      <span style={{
        color: '#fff', fontSize: 11, fontWeight: 600, textAlign: 'center',
        textShadow: '0 1px 3px rgba(0,0,0,0.9)', lineHeight: 1.3,
        maxWidth: 70, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
      }}>
        {name}
      </span>
    </div>
    </Link>
  )
}

function PitchRow({ players }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-evenly', width: '100%', padding: '0 8px' }}>
      {players.map(p => <PlayerPin key={p.player_id} player={p} />)}
    </div>
  )
}

function BestXI({ xi }) {
  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
      <div style={{
        background: 'linear-gradient(180deg, #1e6b30 0%, #256b35 50%, #1e6b30 100%)',
        position: 'relative',
        padding: '20px 8px',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <div style={{
          position: 'absolute', top: '50%', left: 16, right: 16,
          height: 1, backgroundColor: 'rgba(255,255,255,0.2)',
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 60, height: 60, borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.2)',
        }} />
        <PitchRow players={xi.fw} />
        <PitchRow players={xi.mf} />
        <PitchRow players={xi.df} />
        <PitchRow players={xi.gk} />
      </div>
    </div>
  )
}

function StandingsTable({ rows }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 12 }}>
      {rows.map((row) => (
        <div key={row.team_id} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          backgroundColor: row.color_primary ?? '#333',
          borderRadius: 8,
          padding: '10px 14px',
        }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: 'rgba(255,255,255,0.7)', width: 24, flexShrink: 0 }}>
            {row.rank}
          </span>
          <Link href={`/team/${row.team_id}`} style={{ textDecoration: 'none', color: '#fff', fontSize: 13, fontWeight: 800, letterSpacing: '0.05em' }}>
            {row.name_en ?? row.name_ja}
          </Link>
          <span style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 900, color: '#fff' }}>
            {row.points}
          </span>
        </div>
      ))}
    </div>
  )
}

// ---- メインページ ----

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
  const validRound = rounds.includes(roundNumber) ? roundNumber : currentRound

  const idx = rounds.indexOf(validRound)
  const prevRound = idx > 0 ? rounds[idx - 1] : null
  const nextRound = idx < rounds.length - 1 ? rounds[idx + 1] : null

  const [fixtures, standingsRows, playerRows, nextFixtures, earlyFixtures] = await Promise.all([
    getFixturesByRound(validRound),
    getStandings(),
    getBestXIPlayers(validRound),
    nextRound ? getFixturesByRound(nextRound) : Promise.resolve([]),
    getEarlyFixtures([validRound, nextRound ?? validRound]),
  ])
  const isCurrentRound = validRound === currentRound
  const hasScore = fixtures.some(f => ['FT', 'AET', 'PEN', 'LIVE', 'HT'].includes(f.status))

  const eastFixtures = fixtures.filter(f => f.home_group === 'EAST' || f.away_group === 'EAST')
  const westFixtures = fixtures.filter(f => f.home_group === 'WEST' || f.away_group === 'WEST')
  const sortByDateTime = (arr) => [...arr].sort((a, b) => {
    const dateDiff = new Date(a.date) - new Date(b.date)
    if (dateDiff !== 0) return dateDiff
    return (TEAM_ORDER.indexOf(a.home_team_id) ?? 999) - (TEAM_ORDER.indexOf(b.home_team_id) ?? 999)
  })
  const eastNextFixtures = sortByDateTime(nextFixtures.filter(f => f.home_group === 'EAST' || f.away_group === 'EAST'))
  const westNextFixtures = sortByDateTime(nextFixtures.filter(f => f.home_group === 'WEST' || f.away_group === 'WEST'))

  // 早期開催試合（±3日以内・現在節と次節を除く）
  const earlyFinished = earlyFixtures.filter(f => ['FT', 'AET', 'PEN'].includes(f.status))
  const earlyUpcoming = earlyFixtures.filter(f => !['FT', 'AET', 'PEN', 'LIVE', 'HT'].includes(f.status))
  const eastEarlyFinished = earlyFinished.filter(f => f.home_group === 'EAST' || f.away_group === 'EAST')
  const westEarlyFinished = earlyFinished.filter(f => f.home_group === 'WEST' || f.away_group === 'WEST')
  const eastEarlyUpcoming = earlyUpcoming.filter(f => f.home_group === 'EAST' || f.away_group === 'EAST')
  const westEarlyUpcoming = earlyUpcoming.filter(f => f.home_group === 'WEST' || f.away_group === 'WEST')
  const eastStandings = standingsRows.filter(r => r.group_name === 'EAST')
  const westStandings = standingsRows.filter(r => r.group_name === 'WEST')

  const eastPlayers = playerRows.filter(p => p.team_group === 'EAST')
  const westPlayers = playerRows.filter(p => p.team_group === 'WEST')
  const eastXI = eastPlayers.length > 0 ? pickBestXI(eastPlayers) : null
  const westXI = westPlayers.length > 0 ? pickBestXI(westPlayers) : null

  return (
    <div>
      {/* タイトル + 装飾 */}
      <div className="title-row" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <h1 className="site-title" style={{ fontWeight: 900, color: '#fff', letterSpacing: '0.07em', lineHeight: 1 }}>
          J.Leak Stats
        </h1>
        {/* 装飾円（Jリーグロゴイメージ） */}
        <div className="deco-circles" style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
          <div className="deco-circle-white" style={{
            position: 'absolute', top: 0, right: 0,
            width: 100, height: 100, borderRadius: '50%',
            backgroundColor: '#fff',
          }} />
          <div className="deco-circle-red" style={{
            position: 'absolute', top: 71, right: 70,
            width: 100, height: 100, borderRadius: '50%',
            backgroundColor: '#8b1a1a',
          }} />
        </div>
      </div>

      <GroupTabs
        validRound={validRound}
        nextRound={nextRound}
        eastColor="#ffffff"
        westColor="#ffffff"
        eastContent={
          <div>
            {eastFixtures.length > 0 && (
              <div className="grid-fixtures-5col" style={{ marginBottom: 16 }}>
                {eastFixtures.map(f => <FixtureCard key={f.id} fixture={f} />)}
              </div>
            )}
            <EarlyFixtureGroup fixtures={[...eastEarlyFinished, ...eastEarlyUpcoming]} finished={false} />
            <div className="grid-charts-2col" style={{ marginTop: 60 }}>
              <PointsChart group="EAST" />
              <StandingsChart group="EAST" />
            </div>
            <ScatterChart group="EAST" />
            <HeatmapChart group="EAST" />
          </div>
        }
        westContent={
          <div>
            {westFixtures.length > 0 && (
              <div className="grid-fixtures-5col" style={{ marginBottom: 16 }}>
                {westFixtures.map(f => <FixtureCard key={f.id} fixture={f} />)}
              </div>
            )}
            <EarlyFixtureGroup fixtures={[...westEarlyFinished, ...westEarlyUpcoming]} finished={false} />
            <div className="grid-charts-2col" style={{ marginTop: 60 }}>
              <PointsChart group="WEST" />
              <StandingsChart group="WEST" />
            </div>
            <ScatterChart group="WEST" />
            <HeatmapChart group="WEST" />
          </div>
        }
        bottomEastContent={eastNextFixtures.length > 0 ? (
          <div className="grid-fixtures-5col">
            {eastNextFixtures.map(f => <UpcomingFixtureCard key={f.id} fixture={f} />)}
          </div>
        ) : null}
        bottomWestContent={westNextFixtures.length > 0 ? (
          <div className="grid-fixtures-5col">
            {westNextFixtures.map(f => <UpcomingFixtureCard key={f.id} fixture={f} />)}
          </div>
        ) : null}
      />

    </div>
  )
}
