import sql from '@/lib/db'
import { getRoundNumber, statusMap, formatDateJa } from '@/lib/utils'
import { notFound } from 'next/navigation'

async function getFixture(id) {
  const rows = await sql`
    SELECT
      f.*,
      ht.name_ja AS home_name, ht.short_name AS home_short,
      ht.color_primary AS home_color, ht.motif AS home_motif,
      at.name_ja AS away_name, at.short_name AS away_short,
      at.color_primary AS away_color, at.motif AS away_motif,
      vm.name_ja AS venue_name
    FROM fixtures f
    LEFT JOIN teams_master ht ON f.home_team_id = ht.id
    LEFT JOIN teams_master at ON f.away_team_id = at.id
    LEFT JOIN venues_master vm ON f.venue_id = vm.id
    WHERE f.id = ${parseInt(id)}
  `
  return rows[0] ?? null
}

async function getStatistics(fixtureId) {
  const rows = await sql`
    SELECT fs.*, tm.name_ja, tm.motif
    FROM fixture_statistics fs
    LEFT JOIN teams_master tm ON fs.team_id = tm.id
    WHERE fs.fixture_id = ${fixtureId}
  `
  return rows
}

async function getEvents(fixtureId) {
  const rows = await sql`
    SELECT fe.*, tm.name_ja AS team_name
    FROM fixture_events fe
    LEFT JOIN teams_master tm ON fe.team_id = tm.id
    WHERE fe.fixture_id = ${fixtureId}
    ORDER BY fe.elapsed ASC
  `
  return rows
}

async function getPlayerStats(fixtureId) {
  const rows = await sql`
    SELECT fps.*, pm.name_ja, tm.name_ja AS team_name, tm.motif AS team_motif
    FROM fixture_player_stats fps
    LEFT JOIN players_master pm ON fps.player_id = pm.id
    LEFT JOIN teams_master tm ON fps.team_id = tm.id
    WHERE fps.fixture_id = ${fixtureId}
    ORDER BY fps.rating DESC NULLS LAST
  `
  return rows
}

async function getPredictions(fixtureId) {
  const rows = await sql`
    SELECT * FROM fixture_predictions WHERE fixture_id = ${fixtureId} LIMIT 1
  `.catch(() => [])
  return rows[0] ?? null
}

async function getOdds(fixtureId) {
  const rows = await sql`
    SELECT * FROM fixture_odds
    WHERE fixture_id = ${fixtureId} AND bet_id = 1
    ORDER BY bookmaker_id ASC
  `.catch(() => [])
  return rows
}

// ---- UIコンポーネント ----

function StatBar({ label, homeVal, awayVal, homeColor }) {
  const homeNum = parseFloat(homeVal) || 0
  const awayNum = parseFloat(awayVal) || 0
  const total = homeNum + awayNum
  const homePct = total > 0 ? (homeNum / total) * 100 : 50

  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{homeVal ?? '-'}</span>
        <span>{label}</span>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{awayVal ?? '-'}</span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
        <div style={{ width: `${homePct}%`, backgroundColor: homeColor || 'var(--accent)' }} />
        <div style={{ width: `${100 - homePct}%`, backgroundColor: 'var(--border-color)' }} />
      </div>
    </div>
  )
}

const eventTypeLabel = {
  'Goal': '⚽', 'Card': '🟨', 'subst': '🔄',
}
const goalDetailLabel = {
  'Normal Goal': 'ゴール', 'Own Goal': 'オウンゴール', 'Penalty': 'PK',
}
const cardDetailLabel = {
  'Yellow Card': '🟨 イエロー', 'Red Card': '🟥 レッド', 'Yellow Red Card': '🟥 2枚目イエロー',
}

export default async function FixturePage({ params }) {
  const { id } = await params
  const fixture = await getFixture(id)
  if (!fixture) notFound()

  const isFinished = ['FT', 'AET', 'PEN'].includes(fixture.status)
  const isLive = ['LIVE', 'HT'].includes(fixture.status)
  const hasStarted = isFinished || isLive

  const [stats, events, playerStats, odds] = await Promise.all([
    isFinished ? getStatistics(fixture.id) : Promise.resolve([]),
    isFinished ? getEvents(fixture.id) : Promise.resolve([]),
    isFinished ? getPlayerStats(fixture.id) : Promise.resolve([]),
    getOdds(fixture.id),
  ])

  const homeStats = stats.find(s => s.team_id === fixture.home_team_id)
  const awayStats = stats.find(s => s.team_id === fixture.away_team_id)

  const status = statusMap[fixture.status] ?? fixture.status

  // オッズ平均（Match Winner）
  const homeOdds = odds.filter(o => o.value === 'Home')
  const drawOdds = odds.filter(o => o.value === 'Draw')
  const awayOdds = odds.filter(o => o.value === 'Away')
  const avg = (arr) => arr.length ? (arr.reduce((s, o) => s + parseFloat(o.odd), 0) / arr.length).toFixed(2) : '-'

  return (
    <div className="max-w-2xl mx-auto">

      {/* ヘッダー: スコア */}
      <div className="rounded-xl p-6 mb-4 text-center" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          {getRoundNumber(fixture.round)} ·{' '}
          {fixture.venue_name ?? ''}
          {fixture.referee_en ? ` · 主審: ${fixture.referee_en}` : ''}
        </p>
        <p className="text-xs mb-4" style={{ color: isLive ? 'var(--accent)' : 'var(--text-secondary)' }}>
          {isLive ? `● LIVE ${fixture.elapsed ? fixture.elapsed + "'" : ''}` : hasStarted ? status : formatDateJa(fixture.date)}
        </p>

        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 text-center">
            <div className="text-4xl mb-2">{fixture.home_motif ?? '⚽'}</div>
            <p className="font-bold text-sm">{fixture.home_name}</p>
          </div>

          <div className="text-center shrink-0">
            {hasStarted ? (
              <p className="text-5xl font-bold tabular-nums tracking-tight">
                {fixture.home_score ?? 0}
                <span className="mx-2 text-3xl" style={{ color: 'var(--text-secondary)' }}>-</span>
                {fixture.away_score ?? 0}
              </p>
            ) : (
              <p className="text-3xl font-bold" style={{ color: 'var(--accent)' }}>VS</p>
            )}
            {(fixture.home_score_ht != null) && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                前半 {fixture.home_score_ht}-{fixture.away_score_ht}
              </p>
            )}
          </div>

          <div className="flex-1 text-center">
            <div className="text-4xl mb-2">{fixture.away_motif ?? '⚽'}</div>
            <p className="font-bold text-sm">{fixture.away_name}</p>
          </div>
        </div>
      </div>

      {/* 試合スタッツ（試合後） */}
      {isFinished && homeStats && awayStats && (
        <section className="rounded-xl p-5 mb-4" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
          <h2 className="text-sm font-bold mb-4" style={{ color: 'var(--text-secondary)' }}>試合スタッツ</h2>
          <StatBar label="ボール支配率" homeVal={homeStats.possession} awayVal={awayStats.possession} homeColor={fixture.home_color} />
          <StatBar label="シュート" homeVal={homeStats.shots_total} awayVal={awayStats.shots_total} homeColor={fixture.home_color} />
          <StatBar label="枠内シュート" homeVal={homeStats.shots_on} awayVal={awayStats.shots_on} homeColor={fixture.home_color} />
          <StatBar label="コーナー" homeVal={homeStats.corners} awayVal={awayStats.corners} homeColor={fixture.home_color} />
          <StatBar label="ファウル" homeVal={homeStats.fouls} awayVal={awayStats.fouls} homeColor={fixture.home_color} />
          <StatBar label="パス" homeVal={homeStats.passes_total} awayVal={awayStats.passes_total} homeColor={fixture.home_color} />
          {homeStats.expected_goals && (
            <StatBar label="xG" homeVal={homeStats.expected_goals} awayVal={awayStats.expected_goals} homeColor={fixture.home_color} />
          )}
        </section>
      )}

      {/* タイムライン（ゴール・カード・交代） */}
      {isFinished && events.length > 0 && (
        <section className="rounded-xl p-5 mb-4" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
          <h2 className="text-sm font-bold mb-4" style={{ color: 'var(--text-secondary)' }}>タイムライン</h2>
          <div className="flex flex-col gap-2">
            {events.map((ev, i) => {
              const isHome = ev.team_id === fixture.home_team_id
              const icon = eventTypeLabel[ev.type] ?? '•'
              const detail = ev.type === 'Goal' ? (goalDetailLabel[ev.detail] ?? ev.detail)
                : ev.type === 'Card' ? (cardDetailLabel[ev.detail] ?? ev.detail)
                : ev.detail
              return (
                <div key={i} className={`flex items-center gap-2 text-sm ${isHome ? '' : 'flex-row-reverse'}`}>
                  <span className="text-base">{icon}</span>
                  <span className="text-xs w-8 text-center font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {ev.elapsed}'
                  </span>
                  <div className={`flex flex-col ${isHome ? '' : 'items-end'}`}>
                    <span style={{ color: 'var(--text-primary)' }}>{ev.player_name_en}</span>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{detail}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 選手評価（上位5人） */}
      {isFinished && playerStats.length > 0 && (
        <section className="rounded-xl p-5 mb-4" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
          <h2 className="text-sm font-bold mb-4" style={{ color: 'var(--text-secondary)' }}>選手評価 TOP5</h2>
          <div className="flex flex-col gap-2">
            {playerStats.slice(0, 5).map((p, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs w-4" style={{ color: 'var(--text-secondary)' }}>{i + 1}</span>
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {p.name_ja ?? p.player_id}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{p.team_motif}</span>
                </div>
                <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
                  {p.rating ?? '-'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 市場予測オッズ（試合前） */}
      {odds.length > 0 && (
        <section className="rounded-xl p-5 mb-4" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
          <h2 className="text-sm font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>市場予測</h2>
          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
            海外ブックメーカーオッズの平均値（参考情報）
          </p>
          <div className="flex gap-3">
            {[
              { label: fixture.home_short ?? 'ホーム', val: avg(homeOdds) },
              { label: '引き分け', val: avg(drawOdds) },
              { label: fixture.away_short ?? 'アウェイ', val: avg(awayOdds) },
            ].map(({ label, val }) => (
              <div key={label} className="flex-1 text-center rounded-lg py-3" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</p>
                <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{val}</p>
              </div>
            ))}
          </div>
          <p className="text-xs mt-3 text-right">
            <a
              href="https://winner-group.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent)' }}
            >
              WINNERで購入はこちら →
            </a>
          </p>
        </section>
      )}

      {/* データなし（試合前・未取得） */}
      {!hasStarted && odds.length === 0 && (
        <div className="rounded-xl p-6 text-center" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
          <p style={{ color: 'var(--text-secondary)' }} className="text-sm">
            試合前のため詳細データはありません
          </p>
        </div>
      )}
    </div>
  )
}
