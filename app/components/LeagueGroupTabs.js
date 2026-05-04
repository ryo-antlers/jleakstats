'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

const DOW = ['日', '月', '火', '水', '木', '金', '土']
const JST = 'Asia/Tokyo'
const FINISHED = new Set(['FT', 'AET', 'PEN'])
const LIVE = new Set(['1H', '2H', 'HT', 'ET', 'P', 'BT'])

const isoToJSTDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: JST }).format(new Date(iso))
const isoToJSTHHMM = (iso) => new Intl.DateTimeFormat('ja-JP', {
  timeZone: JST, hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(iso))
const todayJST = () => new Intl.DateTimeFormat('en-CA', { timeZone: JST }).format(new Date())
const getDow = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}
function color(c) {
  if (!c) return '#444'
  // 既に#付きならそのまま、無ければ追加 (DBに両形式が混在する可能性に対応)
  return String(c).startsWith('#') ? c : `#${c}`
}
function textColor(hex) {
  if (!hex) return '#fff'
  const h = String(hex).replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 150 ? '#1a1a1a' : '#fff'
}
function teamAbbr(short) {
  if (!short) return '---'
  return short.slice(0, 3).toUpperCase()
}

const TABS_DEF = [
  { key: 'j1East',     label: 'J1 EAST' },
  { key: 'j1West',     label: 'J1 WEST' },
  { key: 'j2j3EastA',  label: 'J2J3 EAST-A' },
  { key: 'j2j3EastB',  label: 'J2J3 EAST-B' },
  { key: 'j2j3WestA',  label: 'J2J3 WEST-A' },
  { key: 'j2j3WestB',  label: 'J2J3 WEST-B' },
]

export default function LeagueGroupTabs({ groups, standings }) {
  const [active, setActive] = useState('j1East')
  const navRef = useRef(null)
  const [underline, setUnderline] = useState({ left: 0, width: 0 })

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const btn = nav.querySelector(`[data-key="${active}"]`)
    if (btn) setUnderline({ left: btn.offsetLeft, width: btn.offsetWidth })
  }, [active])

  const fixtures = groups[active] ?? []
  const standing = standings?.[active] ?? null

  return (
    <section style={{ marginBottom: 32 }}>
      {/* タブ */}
      <nav
        ref={navRef}
        className="lgt-nav"
        style={{
          display: 'flex',
          position: 'relative',
          borderBottom: '1px solid rgba(255,255,255,0.18)',
          marginTop: 80,
          marginBottom: 22,
          overflowX: 'auto',
          overflowY: 'hidden',
          paddingBottom: 2,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {TABS_DEF.map(t => {
          const isActive = active === t.key
          return (
            <button
              key={t.key}
              data-key={t.key}
              onClick={() => setActive(t.key)}
              style={{
                flex: '1 1 0',
                minWidth: 110,
                padding: '16px 8px',
                background: 'none',
                border: 'none',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
                fontSize: 14,
                fontWeight: isActive ? 900 : 700,
                letterSpacing: '0.08em',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'color 0.2s ease, font-weight 0.2s ease',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = 'rgba(255,255,255,0.85)' }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}
            >
              {t.label}
            </button>
          )
        })}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: underline.left,
          width: underline.width,
          height: 3,
          backgroundColor: '#fff',
          transition: 'left 0.36s cubic-bezier(0.4, 0, 0.2, 1), width 0.36s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      </nav>

      {/* タイムライン */}
      <FixtureTimeline fixtures={fixtures} key={active} />

      {/* アクティブタブの順位表 */}
      {standings && (
        <div style={{ marginTop: 32 }}>
          {Object.entries(standings).map(([k, content]) => (
            <div key={k} style={{ display: k === active ? 'block' : 'none' }}>
              {content}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// =====================================================
// 横スクロールタイムライン (日付でグルーピング)
// =====================================================
function FixtureTimeline({ fixtures }) {
  const scrollRef = useRef(null)
  const today = todayJST()

  // 日付でグルーピング (同じ日の試合は1つの日付見出し下にまとめる)
  const dateGroups = useMemo(() => {
    const sorted = [...(fixtures ?? [])].sort((a, b) => new Date(a.date) - new Date(b.date))
    const groups = []
    let cur = null
    for (const f of sorted) {
      const d = isoToJSTDate(f.date)
      if (!cur || cur.date !== d) {
        cur = { date: d, fixtures: [] }
        groups.push(cur)
      }
      cur.fixtures.push(f)
    }
    return groups
  }, [fixtures])

  // 直近 (今日に最も近い) 日付グループのindex
  const todayGroupIdx = useMemo(() => {
    if (dateGroups.length === 0) return 0
    const todayMs = new Date(today + 'T12:00:00+09:00').getTime()
    let best = 0
    let bestDiff = Infinity
    dateGroups.forEach((g, i) => {
      const diff = Math.abs(new Date(g.date + 'T12:00:00+09:00').getTime() - todayMs)
      if (diff < bestDiff) { bestDiff = diff; best = i }
    })
    return best
  }, [dateGroups, today])

  // マウント時に直近グループへスクロール
  useEffect(() => {
    const el = scrollRef.current
    if (!el || dateGroups.length === 0) return
    const groupEls = el.querySelectorAll('[data-date-group]')
    const target = groupEls[todayGroupIdx]
    if (target) {
      const containerRect = el.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const offset = (targetRect.left - containerRect.left) - (containerRect.width / 2 - targetRect.width / 2)
      el.scrollTo({ left: el.scrollLeft + offset, behavior: 'auto' })
    }
  }, [todayGroupIdx, dateGroups.length])

  if (dateGroups.length === 0) {
    return (
      <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12, padding: '40px 0' }}>
        試合データがありません
      </p>
    )
  }

  return (
    <>
      <style>{`
        .lgt-timeline::-webkit-scrollbar { display: none; }
        .lgt-nav::-webkit-scrollbar { display: none; }
        @media (max-width: 640px) {
          .lgt-card-link { width: 80px !important; }
          .lgt-card-abbr { font-size: 11px !important; letter-spacing: 0.02em !important; }
          .lgt-card-tile { height: 30px !important; }
          .lgt-card-score { font-size: 15px !important; }
          .lgt-card-pk { font-size: 10px !important; }
          .lgt-card-status { font-size: 8px !important; }
          .lgt-round { font-size: 8px !important; }
          .lgt-date { font-size: 14px !important; }
        }
      `}</style>
      <div
        ref={scrollRef}
        className="lgt-timeline"
        style={{
          display: 'flex', gap: 24,
          overflowX: 'auto', overflowY: 'visible',
          padding: '4px 4px 8px',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {dateGroups.map(g => (
          <DateGroupBlock key={g.date} group={g} isToday={g.date === today} />
        ))}
      </div>
    </>
  )
}

// =====================================================
// 日付グループ (日付ヘッダー + そのカードたち)
// =====================================================
function DateGroupBlock({ group, isToday }) {
  const [, m, d] = group.date.split('-')
  // 同日グループの代表として最初の試合の節 (混在ケースは稀だが先頭優先)
  const round = group.fixtures.find(f => f.round_number != null)?.round_number ?? null

  return (
    <div data-date-group style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {/* 日付ヘッダー (グループに1個) */}
      <div style={{
        textAlign: 'center', marginBottom: 10, paddingBottom: 10,
        borderBottom: '1px solid rgba(255,255,255,0.18)',
      }}>
        {round != null && (
          <div className="lgt-round" style={{
            fontSize: 9, fontWeight: 700, marginBottom: 2,
            color: isToday ? '#4caf50' : 'rgba(255,255,255,0.55)',
            letterSpacing: '0.06em',
          }}>
            第{round}節
          </div>
        )}
        <div className="lgt-date" style={{
          fontSize: 18, fontWeight: 900,
          color: isToday ? '#4caf50' : '#fff',
          fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, letterSpacing: '0.02em',
        }}>
          {parseInt(m)}/{parseInt(d)}
        </div>
      </div>

      {/* 試合カード (横並び) */}
      <div style={{ display: 'flex', gap: 10 }}>
        {group.fixtures.map(f => <FixtureCardCompact key={f.id} fixture={f} />)}
      </div>
    </div>
  )
}

// =====================================================
// 1試合カード (クラブカラータイルでスコア表示)
// =====================================================
function FixtureCardCompact({ fixture: f }) {
  const isFinished = FINISHED.has(f.status)
  const isLive = LIVE.has(f.status)
  const time = isoToJSTHHMM(f.date)
  const isPK = f.status === 'PEN' && f.home_penalty != null
  const homeC = color(f.home_color)
  const awayC = color(f.away_color)

  return (
    <Link
      href={`/fixture/${f.id}`}
      className="lgt-card-link"
      style={{
        flexShrink: 0,
        width: 116,
        textDecoration: 'none', color: 'inherit',
      }}
    >
      <article style={{
        display: 'flex', flexDirection: 'column',
        transition: 'transform 0.15s ease',
      }}
      onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
      >
        {/* チーム略称 */}
        <div style={{ display: 'flex' }}>
          <span className="lgt-card-abbr" style={{
            flex: 1, fontSize: 14, fontWeight: 900, color: '#fff',
            letterSpacing: '0.04em', textAlign: 'center',
          }}>
            {f.home_abbr ?? teamAbbr(f.home_short)}
          </span>
          <span className="lgt-card-abbr" style={{
            flex: 1, fontSize: 14, fontWeight: 900, color: '#fff',
            letterSpacing: '0.04em', textAlign: 'center',
          }}>
            {f.away_abbr ?? teamAbbr(f.away_short)}
          </span>
        </div>

        {/* スコア = クラブカラータイル */}
        <div style={{ display: 'flex', marginTop: 3 }}>
          {isFinished || isLive ? (
            <>
              <div className="lgt-card-tile lgt-card-score" style={{
                flex: 1, height: 44, backgroundColor: homeC,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 900, color: textColor(homeC),
                fontVariantNumeric: 'tabular-nums',
              }}>{f.home_score ?? 0}</div>
              <div className="lgt-card-tile lgt-card-score" style={{
                flex: 1, height: 44, backgroundColor: awayC,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 900, color: textColor(awayC),
                fontVariantNumeric: 'tabular-nums',
              }}>{f.away_score ?? 0}</div>
            </>
          ) : (
            <>
              <div className="lgt-card-tile" style={{ flex: 1, height: 44, backgroundColor: homeC }} />
              <div className="lgt-card-tile" style={{ flex: 1, height: 44, backgroundColor: awayC }} />
            </>
          )}
        </div>

        {/* PK */}
        {isPK && (
          <div className="lgt-card-pk" style={{
            marginTop: 3, textAlign: 'center',
            fontSize: 12, fontWeight: 700,
            color: '#fff',
          }}>
            PK {f.home_penalty}-{f.away_penalty}
          </div>
        )}

        {/* 時刻 / ステータス (終了試合は表示しない) */}
        {!isFinished && (
          <div className="lgt-card-status" style={{
            marginTop: 4, textAlign: 'center',
            fontSize: 10, fontWeight: 700,
            color: isLive ? '#ef5350' : '#fff',
            letterSpacing: '0.04em',
          }}>
            {isLive ? `LIVE ${f.elapsed ?? ''}'` : `${time} KO`}
          </div>
        )}
      </article>
    </Link>
  )
}

