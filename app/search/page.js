import Link from 'next/link'
import { Building2, Flag, Users } from 'lucide-react'
import sql from '@/lib/db'
import SearchForm from './search-form'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: '試合検索 | J.Leak Stats',
}

const PER_PAGE = 30

function leagueLabel(leagueId) {
  switch (Number(leagueId)) {
    case 1: return 'J1'
    case 2: return 'J2'
    case 98: return '百年構想'
    case 100: return 'カップ'
    default: return ''
  }
}

function formatJST(iso) {
  if (!iso) return ''
  const d = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

async function fetchTeams() {
  return sql`
    SELECT id, name_ja, short_name, color_primary, group_name
    FROM teams_master
    WHERE name_ja IS NOT NULL
    ORDER BY name_ja ASC
  `.catch(() => [])
}

async function fetchReferees() {
  // 各審判の「最新試合のリーグ」で tier を振り分け
  //   J1 (league_id=1) -> 1, J2=2, J3=3, それ以外(カップ・百年構想)=4
  // tier ASC, 最新試合 DESC で並べる
  return sql`
    WITH last_per_ref AS (
      SELECT DISTINCT ON (referee_ja_official)
        referee_ja_official,
        league_id AS last_league,
        date AS last_date
      FROM fixtures
      WHERE referee_ja_official IS NOT NULL
        AND referee_ja_official <> ''
      ORDER BY referee_ja_official, date DESC
    )
    SELECT
      referee_ja_official,
      CASE last_league
        WHEN 1 THEN 1
        WHEN 2 THEN 2
        WHEN 3 THEN 3
        ELSE 4
      END AS tier,
      last_date
    FROM last_per_ref
    ORDER BY tier ASC, last_date DESC
  `.catch(() => [])
}

async function fetchResults({ team1, team2, referee, page }) {
  const t1 = team1 ? Number(team1) : null
  const t2 = team2 ? Number(team2) : null
  const ref = referee ? String(referee).trim() : null
  const validT1 = Number.isFinite(t1) && t1 > 0 ? t1 : null
  const validT2 = Number.isFinite(t2) && t2 > 0 ? t2 : null
  const validRef = ref || null
  const offset = (page - 1) * PER_PAGE

  if (!validT1 && !validT2 && !validRef) return { rows: [], total: 0 }

  const teamCond = validT1 && validT2
    ? { kind: 'pair', a: validT1, b: validT2 }
    : validT1
      ? { kind: 'single', t: validT1 }
      : validT2
        ? { kind: 'single', t: validT2 }
        : { kind: 'none' }
  const refCond = validRef ? { kind: 'ref' } : { kind: 'none' }

  // クエリ毎の WHERE 句を組み立てる関数
  async function runWith(buildQuery, buildCount) {
    try {
      const [rows, countRes] = await Promise.all([buildQuery(), buildCount()])
      const total = Number(countRes[0]?.total ?? 0)
      return { rows, total }
    } catch {
      return { rows: [], total: 0 }
    }
  }

  if (teamCond.kind === 'pair' && refCond.kind === 'ref') {
    return runWith(
      () => sql`
        SELECT
          f.id, f.date, f.status, f.home_score, f.away_score,
          f.home_penalty, f.away_penalty, f.league_id, f.round_number,
          f.referee_ja_official, f.venue_name_ja, f.attendance,
          ht.name_ja AS home_name, ht.short_name AS home_short, ht.abbr AS home_abbr, ht.color_primary AS home_color,
          at.name_ja AS away_name, at.short_name AS away_short, at.abbr AS away_abbr, at.color_primary AS away_color
        FROM fixtures f
        LEFT JOIN teams_master ht ON ht.id = f.home_team_id
        LEFT JOIN teams_master at ON at.id = f.away_team_id
        WHERE ((f.home_team_id = ${teamCond.a} AND f.away_team_id = ${teamCond.b})
            OR (f.home_team_id = ${teamCond.b} AND f.away_team_id = ${teamCond.a}))
          AND f.referee_ja_official = ${validRef}
          AND f.finished_at IS NOT NULL
        ORDER BY f.date DESC
        LIMIT ${PER_PAGE} OFFSET ${offset}
      `,
      () => sql`
        SELECT COUNT(*)::int AS total FROM fixtures f
        WHERE ((f.home_team_id = ${teamCond.a} AND f.away_team_id = ${teamCond.b})
            OR (f.home_team_id = ${teamCond.b} AND f.away_team_id = ${teamCond.a}))
          AND f.referee_ja_official = ${validRef}
          AND f.finished_at IS NOT NULL
      `
    )
  }
  if (teamCond.kind === 'pair') {
    return runWith(
      () => sql`
        SELECT
          f.id, f.date, f.status, f.home_score, f.away_score,
          f.home_penalty, f.away_penalty, f.league_id, f.round_number,
          f.referee_ja_official, f.venue_name_ja, f.attendance,
          ht.name_ja AS home_name, ht.short_name AS home_short, ht.abbr AS home_abbr, ht.color_primary AS home_color,
          at.name_ja AS away_name, at.short_name AS away_short, at.abbr AS away_abbr, at.color_primary AS away_color
        FROM fixtures f
        LEFT JOIN teams_master ht ON ht.id = f.home_team_id
        LEFT JOIN teams_master at ON at.id = f.away_team_id
        WHERE ((f.home_team_id = ${teamCond.a} AND f.away_team_id = ${teamCond.b})
            OR (f.home_team_id = ${teamCond.b} AND f.away_team_id = ${teamCond.a}))
          AND f.finished_at IS NOT NULL
        ORDER BY f.date DESC
        LIMIT ${PER_PAGE} OFFSET ${offset}
      `,
      () => sql`
        SELECT COUNT(*)::int AS total FROM fixtures f
        WHERE ((f.home_team_id = ${teamCond.a} AND f.away_team_id = ${teamCond.b})
            OR (f.home_team_id = ${teamCond.b} AND f.away_team_id = ${teamCond.a}))
          AND f.finished_at IS NOT NULL
      `
    )
  }
  if (teamCond.kind === 'single' && refCond.kind === 'ref') {
    return runWith(
      () => sql`
        SELECT
          f.id, f.date, f.status, f.home_score, f.away_score,
          f.home_penalty, f.away_penalty, f.league_id, f.round_number,
          f.referee_ja_official, f.venue_name_ja, f.attendance,
          ht.name_ja AS home_name, ht.short_name AS home_short, ht.abbr AS home_abbr, ht.color_primary AS home_color,
          at.name_ja AS away_name, at.short_name AS away_short, at.abbr AS away_abbr, at.color_primary AS away_color
        FROM fixtures f
        LEFT JOIN teams_master ht ON ht.id = f.home_team_id
        LEFT JOIN teams_master at ON at.id = f.away_team_id
        WHERE (f.home_team_id = ${teamCond.t} OR f.away_team_id = ${teamCond.t})
          AND f.referee_ja_official = ${validRef}
          AND f.finished_at IS NOT NULL
        ORDER BY f.date DESC
        LIMIT ${PER_PAGE} OFFSET ${offset}
      `,
      () => sql`
        SELECT COUNT(*)::int AS total FROM fixtures f
        WHERE (f.home_team_id = ${teamCond.t} OR f.away_team_id = ${teamCond.t})
          AND f.referee_ja_official = ${validRef}
          AND f.finished_at IS NOT NULL
      `
    )
  }
  if (teamCond.kind === 'single') {
    return runWith(
      () => sql`
        SELECT
          f.id, f.date, f.status, f.home_score, f.away_score,
          f.home_penalty, f.away_penalty, f.league_id, f.round_number,
          f.referee_ja_official, f.venue_name_ja, f.attendance,
          ht.name_ja AS home_name, ht.short_name AS home_short, ht.abbr AS home_abbr, ht.color_primary AS home_color,
          at.name_ja AS away_name, at.short_name AS away_short, at.abbr AS away_abbr, at.color_primary AS away_color
        FROM fixtures f
        LEFT JOIN teams_master ht ON ht.id = f.home_team_id
        LEFT JOIN teams_master at ON at.id = f.away_team_id
        WHERE (f.home_team_id = ${teamCond.t} OR f.away_team_id = ${teamCond.t})
          AND f.finished_at IS NOT NULL
        ORDER BY f.date DESC
        LIMIT ${PER_PAGE} OFFSET ${offset}
      `,
      () => sql`
        SELECT COUNT(*)::int AS total FROM fixtures f
        WHERE (f.home_team_id = ${teamCond.t} OR f.away_team_id = ${teamCond.t})
          AND f.finished_at IS NOT NULL
      `
    )
  }
  if (refCond.kind === 'ref') {
    return runWith(
      () => sql`
        SELECT
          f.id, f.date, f.status, f.home_score, f.away_score,
          f.home_penalty, f.away_penalty, f.league_id, f.round_number,
          f.referee_ja_official, f.venue_name_ja, f.attendance,
          ht.name_ja AS home_name, ht.short_name AS home_short, ht.abbr AS home_abbr, ht.color_primary AS home_color,
          at.name_ja AS away_name, at.short_name AS away_short, at.abbr AS away_abbr, at.color_primary AS away_color
        FROM fixtures f
        LEFT JOIN teams_master ht ON ht.id = f.home_team_id
        LEFT JOIN teams_master at ON at.id = f.away_team_id
        WHERE f.referee_ja_official = ${validRef}
          AND f.finished_at IS NOT NULL
        ORDER BY f.date DESC
        LIMIT ${PER_PAGE} OFFSET ${offset}
      `,
      () => sql`
        SELECT COUNT(*)::int AS total FROM fixtures f
        WHERE f.referee_ja_official = ${validRef}
          AND f.finished_at IS NOT NULL
      `
    )
  }
  return { rows: [], total: 0 }
}

export default async function SearchPage({ searchParams }) {
  const sp = (await searchParams) ?? {}
  const team1 = typeof sp.team1 === 'string' ? sp.team1 : ''
  const team2 = typeof sp.team2 === 'string' ? sp.team2 : ''
  const referee = typeof sp.referee === 'string' ? sp.referee : ''
  const pageRaw = Number(sp.page)
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1

  const [teams, refereeRows, { rows: results, total }] = await Promise.all([
    fetchTeams(),
    fetchReferees(),
    fetchResults({ team1, team2, referee, page }),
  ])

  const hasFilter = Boolean(team1 || team2 || referee)
  const referees = refereeRows
    .map(r => ({ name: r.referee_ja_official, tier: Number(r.tier) }))
    .filter(r => r.name)
  const totalPages = total > 0 ? Math.ceil(total / PER_PAGE) : 0

  // ページネーション用のbase URL (page以外のparam)
  const baseParams = new URLSearchParams()
  if (team1) baseParams.set('team1', team1)
  if (team2) baseParams.set('team2', team2)
  if (referee) baseParams.set('referee', referee)
  const baseQuery = baseParams.toString()

  return (
    <div>
      <h1 style={{
        fontSize: 22, fontWeight: 900, color: '#fff',
        letterSpacing: '0.08em', margin: '8px 0 28px',
      }}>
        試合検索
      </h1>

      <SearchForm
        teams={teams}
        referees={referees}
        initial={{ team1, team2, referee }}
      />

      <ResultsSection
        hasFilter={hasFilter}
        results={results}
        total={total}
        page={page}
        totalPages={totalPages}
        baseQuery={baseQuery}
      />
    </div>
  )
}

function ResultsSection({ hasFilter, results, total, page, totalPages, baseQuery }) {
  if (!hasFilter) {
    return (
      <p style={{
        marginTop: 32, fontSize: 12, color: 'rgba(255,255,255,0.35)',
        textAlign: 'center', padding: '40px 16px',
      }}>
        条件を選んで試合を検索してください
      </p>
    )
  }
  if (total === 0) {
    return (
      <p style={{
        marginTop: 32, fontSize: 12, color: 'rgba(255,255,255,0.35)',
        textAlign: 'center', padding: '40px 16px',
      }}>
        該当する試合が見つかりませんでした
      </p>
    )
  }
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10,
        marginBottom: 10, paddingBottom: 6,
        borderBottom: '1px solid #1a1a1a',
      }}>
        <h2 style={{
          fontSize: 12, fontWeight: 800, color: '#fff',
          letterSpacing: '0.18em', margin: 0,
          textTransform: 'uppercase',
        }}>
          結果
        </h2>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 700 }}>
          <span style={{ color: '#fff', fontWeight: 900 }}>{total}</span>件
        </span>
        {totalPages > 1 && (
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginLeft: 'auto', fontWeight: 600 }}>
            {page} / {totalPages} ページ
          </span>
        )}
      </div>
      <ul style={{
        listStyle: 'none', padding: 0, margin: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
        gap: 20,
      }}>
        {results.map(f => <ResultRow key={f.id} f={f} />)}
      </ul>
      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} baseQuery={baseQuery} />
      )}
    </div>
  )
}

function Pagination({ page, totalPages, baseQuery }) {
  const buildHref = (p) => {
    const params = new URLSearchParams(baseQuery)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return qs ? `/search?${qs}` : '/search'
  }
  const prev = page > 1 ? page - 1 : null
  const next = page < totalPages ? page + 1 : null

  // 表示する数字 (前後2ページ + 最初・最後)
  const visible = new Set([1, totalPages, page, page - 1, page + 1, page - 2, page + 2])
  const pages = [...visible].filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 4, marginTop: 20, flexWrap: 'wrap',
    }}>
      {prev ? (
        <Link href={buildHref(prev)} style={navBtnStyle(false)}>← 前</Link>
      ) : (
        <span style={navBtnStyle(true)}>← 前</span>
      )}
      {pages.map((p, i) => {
        const prevP = pages[i - 1]
        const showDots = prevP != null && p - prevP > 1
        return (
          <span key={p} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {showDots && <span style={{ color: 'rgba(255,255,255,0.3)', padding: '0 4px' }}>…</span>}
            {p === page ? (
              <span style={pageBtnStyle(true)}>{p}</span>
            ) : (
              <Link href={buildHref(p)} style={pageBtnStyle(false)}>{p}</Link>
            )}
          </span>
        )
      })}
      {next ? (
        <Link href={buildHref(next)} style={navBtnStyle(false)}>次 →</Link>
      ) : (
        <span style={navBtnStyle(true)}>次 →</span>
      )}
    </div>
  )
}

const navBtnStyle = (disabled) => ({
  padding: '6px 12px', fontSize: 11, fontWeight: 700,
  letterSpacing: '0.06em',
  border: '1px solid rgba(255,255,255,0.1)',
  backgroundColor: 'transparent',
  color: disabled ? 'rgba(255,255,255,0.2)' : '#fff',
  textDecoration: 'none',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontFamily: 'inherit',
})

const pageBtnStyle = (active) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minWidth: 28, padding: '6px 8px',
  fontSize: 11, fontWeight: 800,
  border: '1px solid',
  borderColor: active ? '#00ff87' : 'rgba(255,255,255,0.1)',
  backgroundColor: active ? '#00ff87' : 'transparent',
  color: active ? '#000' : '#fff',
  textDecoration: 'none',
  fontVariantNumeric: 'tabular-nums',
  fontFamily: 'inherit',
})

// `#xxxxxx` / `xxxxxx` 両方に対応 (DB値の表記ゆれ吸収)
function normalizeColor(raw) {
  if (!raw) return null
  const v = String(raw).trim()
  if (!v) return null
  return v.startsWith('#') ? v : `#${v}`
}

// 背景に対して読みやすい文字色を返す
function readableText(hex) {
  if (!hex || hex.length < 7) return '#fff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.55 ? '#fff' : '#000'
}

// 暗くトーンダウンした色 (敗者ブロック用)
function darkenColor(hex, factor = 0.4) {
  if (!hex || hex.length < 7) return hex
  const toHex = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  const r = parseInt(hex.slice(1, 3), 16) * factor
  const g = parseInt(hex.slice(3, 5), 16) * factor
  const b = parseInt(hex.slice(5, 7), 16) * factor
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function ResultRow({ f }) {
  const isPK = f.status === 'PEN' && f.home_penalty != null && f.away_penalty != null
  const comp = leagueLabel(f.league_id)
  const homeColor = normalizeColor(f.home_color) ?? '#555'
  const awayColor = normalizeColor(f.away_color) ?? '#555'
  const homeText = readableText(homeColor)
  const awayText = readableText(awayColor)
  const attendance = f.attendance != null ? Number(f.attendance).toLocaleString() : null
  const venue = f.venue_name_ja || null

  // 勝敗 (敗者は半透明で body 背景に溶けて暗く見える)
  const hs = Number(f.home_score), as = Number(f.away_score)
  const hp = Number(f.home_penalty), ap = Number(f.away_penalty)
  const homeWin = hs > as || (isPK && hp > ap)
  const awayWin = as > hs || (isPK && ap > hp)

  // 英字3文字略称 (abbr) > short_name > name_ja の順で優先
  const homeName = f.home_abbr || f.home_short || f.home_name || '-'
  const awayName = f.away_abbr || f.away_short || f.away_name || '-'

  const halfStyle = (bg, txt, lose) => ({
    backgroundColor: bg, color: txt,
    opacity: lose ? 0.45 : 1,
    padding: '8px 8px 18px',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 2,
    minWidth: 0, minHeight: 78,
    position: 'relative',
  })
  const teamNameStyle = (txt) => ({
    fontWeight: 900, fontSize: 13,
    color: txt,
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    maxWidth: '100%',
  })
  const scoreStyle = (txt) => ({
    fontWeight: 900, fontSize: 26,
    color: txt,
    letterSpacing: '0.02em',
  })
  const pkStyle = (txt) => ({
    position: 'absolute',
    bottom: 3, left: 0, right: 0,
    textAlign: 'center',
    fontSize: 12, fontWeight: 800,
    color: txt,
    letterSpacing: '0.06em',
  })

  return (
    <li>
      <a
        href={`/fixture/${f.id}`}
        className="search-card"
        style={{
          display: 'flex', flexDirection: 'column',
          textDecoration: 'none',
          color: '#fff',
          fontVariantNumeric: 'tabular-nums',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* 上: 日付 + カテゴリー */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          padding: '12px 12px 10px',
        }}>
          <span style={{
            fontSize: 11, color: '#fff',
            fontWeight: 800, letterSpacing: '0.02em',
          }}>
            {formatJST(f.date)}
          </span>
          {comp && (
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
              color: '#bbb',
              textTransform: 'uppercase',
            }}>
              {comp}
            </span>
          )}
        </div>

        {/* 中央: クラブカラー50/50 (敗者は半透明) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <div style={halfStyle(homeColor, homeText, awayWin)}>
            <span style={teamNameStyle(homeText)}>{homeName}</span>
            <span style={scoreStyle(homeText)}>{f.home_score}</span>
            {isPK && <span style={pkStyle(homeText)}>PK {f.home_penalty}</span>}
          </div>
          <div style={halfStyle(awayColor, awayText, homeWin)}>
            <span style={teamNameStyle(awayText)}>{awayName}</span>
            <span style={scoreStyle(awayText)}>{f.away_score}</span>
            {isPK && <span style={pkStyle(awayText)}>PK {f.away_penalty}</span>}
          </div>
        </div>

        {/* 下: メタ情報 (縦積み) */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          marginTop: 'auto',
          padding: '10px 12px 12px',
          fontSize: 10, fontWeight: 700,
          color: '#fff',
          minWidth: 0,
        }}>
          {venue && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 6,
              overflow: 'hidden', minWidth: 0,
            }}>
              <Building2 size={12} strokeWidth={1.8} style={{ flexShrink: 0 }} />
              <span style={{
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{venue}</span>
            </span>
          )}
          {attendance && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 6,
              whiteSpace: 'nowrap',
            }}>
              <Users size={12} strokeWidth={1.8} style={{ flexShrink: 0 }} />
              <span>{attendance}人</span>
            </span>
          )}
          {f.referee_ja_official && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 6,
              overflow: 'hidden', minWidth: 0,
            }}>
              <Flag size={12} strokeWidth={1.8} style={{ flexShrink: 0 }} />
              <span style={{
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{f.referee_ja_official}</span>
            </span>
          )}
        </div>
      </a>
    </li>
  )
}
