'use client'
import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import FantasyLoading from './FantasyLoading'
import Link from 'next/link'

const FORMATIONS = [
  { name: '4-4-2', df: 4, mf: 4, fw: 2 },
  { name: '4-3-3', df: 4, mf: 3, fw: 3 },
  { name: '4-5-1', df: 4, mf: 5, fw: 1 },
  { name: '3-4-3', df: 3, mf: 4, fw: 3 },
  { name: '3-5-2', df: 3, mf: 5, fw: 2 },
  { name: '5-3-2', df: 5, mf: 3, fw: 2 },
]

function textColor(hex) {
  if (!hex) return '#fff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? '#fff' : '#000'
}

function formatBudget(value) {
  const yen = value * 1000
  const oku = Math.floor(yen / 100000000)
  const man = Math.floor((yen % 100000000) / 10000)
  if (oku === 0) return `${man}万`
  if (man === 0) return `${oku}億`
  return `${oku}億${man}万`
}

function autoSelect(squad) {
  const f = FORMATIONS.find(f => f.name === '4-4-2')
  const byPos = {
    GK: [...squad].filter(p => p.position === 'GK').sort((a, b) => a.bought_price - b.bought_price),
    DF: [...squad].filter(p => p.position === 'DF').sort((a, b) => a.bought_price - b.bought_price),
    MF: [...squad].filter(p => p.position === 'MF').sort((a, b) => a.bought_price - b.bought_price),
    FW: [...squad].filter(p => p.position === 'FW').sort((a, b) => a.bought_price - b.bought_price),
  }
  if (byPos.GK.length < 1 || byPos.DF.length < f.df || byPos.MF.length < f.mf || byPos.FW.length < f.fw) return null
  // 各ポジションで最安値1人をベンチに、残りをスタメンに
  const starters = [
    ...byPos.GK.slice(1, 2),   // GK2人中、安い方がベンチ
    ...byPos.DF.slice(1, 1 + f.df),
    ...byPos.MF.slice(1, 1 + f.mf),
    ...byPos.FW.slice(1, 1 + f.fw),
  ]
  return { formation: f, starters }
}

function ScrollName({ name, style }) {
  const containerRef = useRef(null)
  const [overflowPx, setOverflowPx] = useState(0)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    // Temporarily unhide to get true scrollWidth
    el.style.overflow = 'visible'
    const overflow = el.scrollWidth - el.clientWidth
    el.style.overflow = 'hidden'
    setOverflowPx(Math.max(0, overflow))
  }, [name])

  useEffect(() => {
    if (overflowPx <= 0) return
    const iv = setInterval(() => setScrolled(s => !s), 3000)
    return () => clearInterval(iv)
  }, [overflowPx])

  return (
    <div ref={containerRef} style={{ overflow: 'hidden', flex: 1, minWidth: 0, ...style }}>
      <span style={{
        display: 'inline-block', whiteSpace: 'nowrap', paddingLeft: 6,
        transform: scrolled ? `translateX(-${overflowPx}px)` : 'translateX(0)',
        transition: overflowPx > 0 ? 'transform 2.5s ease-in-out' : 'none',
      }}>{name}</span>
    </div>
  )
}

function PitchPlayerCard({ player, isStarter, editMode, onToggle }) {
  const color = player.team_color ?? '#555'
  const selected = editMode && isStarter
  return (
    <button
      onClick={editMode ? () => onToggle(player) : undefined}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        background: 'none', border: 'none', cursor: editMode ? 'pointer' : 'default',
        opacity: editMode && !isStarter ? 0.35 : 1,
        padding: '4px 6px',
        transform: selected ? 'scale(1.08)' : 'scale(1)',
        transition: 'transform 0.15s, opacity 0.15s',
      }}
    >
      <div style={{
        width: 42, height: 42,
        borderRadius: 6,
        backgroundColor: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 800, color: textColor(color),
        boxShadow: selected ? `0 0 0 2px var(--accent), 0 4px 12px rgba(0,0,0,0.5)` : '0 2px 8px rgba(0,0,0,0.4)',
      }}>
        {player.no ?? player.team_abbr?.slice(0, 2) ?? '?'}
      </div>
      <span style={{
        fontSize: 10, color: 'rgba(255,255,255,0.9)', maxWidth: 64,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        textAlign: 'center', textShadow: '0 1px 3px rgba(0,0,0,0.9)', fontWeight: 600,
        letterSpacing: '0.02em',
      }}>
        {player.name_ja ?? player.name_en}
      </span>
    </button>
  )
}

function PitchRow({ players, starterIds, editMode, onToggle }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-evenly', flexWrap: 'wrap', width: '100%' }}>
      {players.map(p => (
        <PitchPlayerCard
          key={p.player_id}
          player={p}
          isStarter={starterIds.has(p.player_id)}
          editMode={editMode}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}

function WeekCalendar({ gameweeks }) {
  const JST = 'Asia/Tokyo'

  const isoToJSTDate = (iso) => {
    if (!iso) return null
    return new Intl.DateTimeFormat('en-CA', { timeZone: JST }).format(new Date(iso))
    // en-CA gives YYYY-MM-DD
  }
  const isoToJSTHHMM = (iso) => {
    if (!iso) return null
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: JST, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso))
  }

  // today in JST
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: JST }).format(new Date())
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayStr + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + i)
    return d.toISOString().slice(0, 10)
  })

  const nowMs = Date.now()
  // GW終了判定：最終試合 + 3時間（gw_end）が過去のもの
  const lastFinished = [...gameweeks]
    .filter(g => {
      const ms = g.gw_end
        ? new Date(g.gw_end).getTime()
        : g.market_open ? new Date(g.market_open).getTime() - 9 * 3600000 : null
      return ms != null && ms <= nowMs
    })
    .at(-1)
  // deadlineがまだ来ていない最初のGW
  const nextUpcoming = gameweeks.find(g => g.deadline && new Date(g.deadline).getTime() > nowMs)
  const marketOpenDate = isoToJSTDate(lastFinished?.market_open)
  const deadlineDate = isoToJSTDate(nextUpcoming?.deadline)
  const marketOpenTime = isoToJSTHHMM(lastFinished?.market_open)
  const deadlineTime = isoToJSTHHMM(nextUpcoming?.deadline)
  // 次のGW終了後の市場オープン日（GW10最終試合+12h）
  const nextMarketOpenDate = isoToJSTDate(nextUpcoming?.market_open)
  const nextMarketOpenTime = isoToJSTHHMM(nextUpcoming?.market_open)

  // classify each day
  const classified = days.map(day => {
    const matchGw = gameweeks.find(gw => gw.start_date <= day && day <= gw.end_date)
    const isDeadlineDay = deadlineDate && day === deadlineDate
    if (matchGw) return { kind: 'gw', gw: matchGw, isDeadlineDay, deadlineTime }
    if (isDeadlineDay)
      return { kind: 'deadline', gw: nextUpcoming, time: deadlineTime }
    if (marketOpenDate && day >= marketOpenDate && (!deadlineDate || day < deadlineDate))
      return { kind: 'market', isFirstDay: day === marketOpenDate, time: marketOpenTime }
    // 次のGW終了後の市場オープン（7日ウィンドウ内に見える場合）
    if (nextMarketOpenDate && day >= nextMarketOpenDate)
      return { kind: 'market', isFirstDay: day === nextMarketOpenDate, time: nextMarketOpenTime }
    return { kind: 'empty' }
  })

  // group consecutive same-kind
  const segments = []
  let seg = null
  for (let i = 0; i < 7; i++) {
    const c = classified[i]
    const key = c.kind === 'gw' ? `gw-${c.gw?.id}` : c.kind
    if (!seg || seg.key !== key) {
      if (seg) segments.push(seg)
      seg = { key, kind: c.kind, colStart: i + 1, colEnd: i + 1, data: c }
    } else {
      seg.colEnd = i + 1
    }
  }
  if (seg) segments.push(seg)

  const fmtDay = (str) => {
    const [, m, d] = str.split('-')
    return `${parseInt(m)}/${parseInt(d)}`
  }
  const DOW = ['日', '月', '火', '水', '木', '金', '土']
  const getDow = (str) => {
    const d = new Date(str + 'T00:00:00Z')
    return DOW[d.getUTCDay()]
  }

  return (
    <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
      {/* Date header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border-color)' }}>
        {days.map((day, i) => {
          const isToday = day === todayStr
          const dow = getDow(day)
          const isSun = dow === '日'
          const isSat = dow === '土'
          const hasGw = classified[i]?.kind === 'gw'
          const GW_GREEN = 'rgb(76, 175, 80)'
          const cellColor = hasGw ? GW_GREEN : isToday ? 'var(--accent)' : isSun ? '#e55' : isSat ? '#5af' : 'var(--text-secondary)'
          return (
            <div key={i} style={{
              textAlign: 'center', padding: '6px 2px', fontSize: 11,
              backgroundColor: 'var(--bg-tertiary)',
              color: cellColor,
              fontWeight: isToday || hasGw ? 700 : 400,
              borderLeft: i > 0 ? '1px solid var(--border-color)' : 'none',
            }}>
              <div>{fmtDay(day)}</div>
              <div style={{ fontSize: 9, marginTop: 1 }}>{dow}</div>
            </div>
          )
        })}
      </div>

      {/* Content row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', minHeight: 72 }}>
        {segments.map((seg, i) => {
          const isGw = seg.kind === 'gw'
          const isDeadline = seg.kind === 'deadline'
          const isMarket = seg.kind === 'market'
          const bg = (isGw || isDeadline) ? '#2d6a2d' : isMarket ? 'var(--bg-secondary)' : 'var(--bg-primary)'
          const fg = (isGw || isDeadline) ? '#fff' : 'var(--text-primary)'
          return (
            <div key={i} style={{
              gridColumn: `${seg.colStart} / ${seg.colEnd + 1}`,
              backgroundColor: bg,
              borderLeft: i > 0 ? `1px solid var(--border-color)` : 'none',
              padding: '10px 10px',
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
            }}>
              {isGw && (
                <>
                  {seg.data.isDeadlineDay && (
                    <>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>{seg.data.deadlineTime}</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>スタメン締切</span>
                    </>
                  )}
                  <span style={{ fontSize: 15, fontWeight: 800, color: fg }}>GW{seg.data.gw?.gw_number}</span>
                </>
              )}
              {isDeadline && (
                <>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>{seg.data.time}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>スタメン締切</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: fg, marginTop: 2 }}>GW{seg.data.gw?.gw_number}</span>
                </>
              )}
              {isMarket && (
                <>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{seg.data.time}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: fg }}>移籍市場</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 11, color: '#4caf50', fontWeight: 700, flexShrink: 0 }}>OPEN</span>
                    <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border-color)' }} />
                    <span style={{ color: 'var(--text-secondary)', fontSize: 13, flexShrink: 0 }}>›</span>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ptColor(pts) {
  if (pts >= 10) return '#4caf50'
  if (pts >= 6) return '#81c784'
  if (pts < 0) return '#e55'
  return 'var(--text-primary)'
}

export default function FantasyPage() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const [user, setUser] = useState(null)
  const [squad, setSquad] = useState([])
  const [formation, setFormation] = useState(null)
  const [starterIds, setStarterIds] = useState(new Set())
  const [editMode, setEditMode] = useState(false)
  const [draggingId, setDraggingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [navigatingToStarters, setNavigatingToStarters] = useState(false)
  const [playerOffsets, setPlayerOffsets] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fantasy_offsets') ?? '{}') } catch { return {} }
  })
  const [posEditId, setPosEditId] = useState(null)
  const [posEditMode, setPosEditMode] = useState(false)
  const dragPosRef = useRef(null)
  const formationRef = useRef(null)
  const [rowOrder, setRowOrder] = useState({})
  const [draggingStarterId, setDraggingStarterId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [gameweeks, setGameweeks] = useState([])
  const [lastGwNum, setLastGwNum] = useState(null)
  const [lastGwId, setLastGwId] = useState(null)
  const [lastGwPlayers, setLastGwPlayers] = useState([])
  const [expandedPlayerId, setExpandedPlayerId] = useState(null)
  const [playerDetails, setPlayerDetails] = useState({})
  const [rankings, setRankings] = useState([])
  const [activeTab, setActiveTab] = useState(1)
  const [countdown, setCountdown] = useState(null)
  const [isMobile, setIsMobile] = useState(false)
  const [rankingModalUser, setRankingModalUser] = useState(null)
  const [rankingModalSquad, setRankingModalSquad] = useState(null)
  const [nextOpponents, setNextOpponents] = useState({})
  const [myId, setMyId] = useState(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    fetch('/api/fantasy/gameweeks/schedule').then(r => r.json()).then(d => setGameweeks(d.gameweeks ?? []))
    fetch('/api/fantasy/last-gw-points').then(r => r.json()).then(d => {
      setLastGwNum(d.gw_number ?? null)
      setLastGwId(d.gw_id ?? null)
      setLastGwPlayers(d.players ?? [])
    }).catch(() => {})
    fetch('/api/fantasy/rankings').then(r => r.json()).then(d => setRankings(d.rankings ?? [])).catch(() => {})
    fetch('/api/fantasy/next-opponents').then(r => r.json()).then(d => setNextOpponents(d.opponents ?? {})).catch(() => {})
  }, [])

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) { router.push('/sign-in'); return }

    Promise.all([
      fetch('/api/fantasy/me').then(r => r.json()),
      fetch('/api/fantasy/squad').then(r => r.json()),
    ]).then(([u, s]) => {
      if (!u.user) { router.push('/fantasy/setup'); return }
      setUser(u.user)
      setMyId(u.user.id ?? null)
      const sq = s.squad ?? []
      if (sq.length === 0) { router.push('/fantasy/new_squad'); return }
      setSquad(sq)

      // DBのオフセット値でplayerOffsetsを初期化（localStorageより優先）
      const dbOffsets = {}
      for (const p of sq) {
        if ((p.pos_offset_x ?? 0) !== 0 || (p.pos_offset_y ?? 0) !== 0) {
          dbOffsets[p.player_id] = { x: p.pos_offset_x ?? 0, y: p.pos_offset_y ?? 0 }
        }
      }
      if (Object.keys(dbOffsets).length > 0) setPlayerOffsets(dbOffsets)

      const savedStarters = sq.filter(p => p.is_starter)
      if (savedStarters.length === 11) {
        setStarterIds(new Set(savedStarters.map(p => p.player_id)))
        const counts = { DF: 0, MF: 0, FW: 0 }
        for (const p of savedStarters) if (p.position in counts) counts[p.position]++
        const f = FORMATIONS.find(f => f.df === counts.DF && f.mf === counts.MF && f.fw === counts.FW)
        setFormation(f ?? FORMATIONS[0])
      } else {
        const auto = autoSelect(sq)
        if (auto) {
          setFormation(auto.formation)
          setStarterIds(new Set(auto.starters.map(p => p.player_id)))
        }
      }
    }).catch(() => {
      router.push('/fantasy/setup')
    }).finally(() => setLoading(false))
  }, [isLoaded, isSignedIn])

  const starterList = squad.filter(p => starterIds.has(p.player_id))
  useEffect(() => {
    localStorage.setItem('fantasy_offsets', JSON.stringify(playerOffsets))
  }, [playerOffsets])

  useEffect(() => {
    if (!posEditId) return
    const onMove = (e) => {
      const { startX, startY, origX, origY, minX, maxX, minY, maxY } = dragPosRef.current
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      setPlayerOffsets(prev => ({
        ...prev,
        [posEditId]: {
          x: Math.max(minX, Math.min(maxX, origX + dx)),
          y: Math.max(minY, Math.min(maxY, origY + dy)),
        }
      }))
    }
    const onUp = () => setPosEditId(null)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [posEditId])

  const bench = squad.filter(p => !starterIds.has(p.player_id))
  const gkRow = starterList.filter(p => p.position === 'GK')
  const dfRow = starterList.filter(p => p.position === 'DF')
  const mfRow = starterList.filter(p => p.position === 'MF')
  const fwRow = starterList.filter(p => p.position === 'FW')

  function changeFormation(f) {
    setFormation(f)
    const byPos = {
      GK: squad.filter(p => p.position === 'GK').sort((a, b) => b.bought_price - a.bought_price),
      DF: squad.filter(p => p.position === 'DF').sort((a, b) => b.bought_price - a.bought_price),
      MF: squad.filter(p => p.position === 'MF').sort((a, b) => b.bought_price - a.bought_price),
      FW: squad.filter(p => p.position === 'FW').sort((a, b) => b.bought_price - a.bought_price),
    }
    if (byPos.GK.length < 1 || byPos.DF.length < f.df || byPos.MF.length < f.mf || byPos.FW.length < f.fw) return
    const starters = [
      ...byPos.GK.slice(0, 1),
      ...byPos.DF.slice(0, f.df),
      ...byPos.MF.slice(0, f.mf),
      ...byPos.FW.slice(0, f.fw),
    ]
    setStarterIds(new Set(starters.map(p => p.player_id)))
  }

  function togglePlayer(player) {
    const pos = player.position
    const newSet = new Set(starterIds)
    if (newSet.has(player.player_id)) {
      const posCount = [...newSet].filter(id => squad.find(p => p.player_id === id)?.position === pos).length
      if (pos === 'GK' && posCount <= 1) return
      newSet.delete(player.player_id)
    } else {
      if (!formation) return
      const limit = pos === 'GK' ? 1 : pos === 'DF' ? formation.df : pos === 'MF' ? formation.mf : formation.fw
      const posCount = [...newSet].filter(id => squad.find(p => p.player_id === id)?.position === pos).length
      if (posCount >= limit) return
      if (newSet.size >= 11) return
      newSet.add(player.player_id)
    }
    setStarterIds(newSet)
  }

  function swapPlayers(benchPlayerId, starterPlayerId) {
    const benchPlayer = squad.find(p => p.player_id === benchPlayerId)
    const starterPlayer = squad.find(p => p.player_id === starterPlayerId)
    if (!benchPlayer || !starterPlayer) return
    // GK同士のみ交換可
    if ((benchPlayer.position === 'GK') !== (starterPlayer.position === 'GK')) return
    const next = new Set(starterIds)
    next.delete(starterPlayerId)
    next.add(benchPlayerId)
    setStarterIds(next)
    setDraggingId(null)
    // スワップした選手のオフセットをリセット
    setPlayerOffsets(prev => {
      const updated = { ...prev }
      updated[benchPlayerId] = { x: 0, y: 0 }
      updated[starterPlayerId] = { x: 0, y: 0 }
      return updated
    })
  }

  function swapStarterOrder(id1, id2) {
    const p1 = squad.find(p => p.player_id === id1)
    const p2 = squad.find(p => p.player_id === id2)
    if (!p1 || !p2 || p1.position !== p2.position) return
    // 現在の行の並び順を確定させてからスワップ
    const rowPlayers = starterList
      .filter(p => p.position === p1.position)
      .sort((a, b) => (rowOrder[a.player_id] ?? 0) - (rowOrder[b.player_id] ?? 0))
    const newOrder = { ...rowOrder }
    rowPlayers.forEach((p, i) => { newOrder[p.player_id] = i })
    const idx1 = rowPlayers.findIndex(p => p.player_id === id1)
    const idx2 = rowPlayers.findIndex(p => p.player_id === id2)
    newOrder[id1] = idx2
    newOrder[id2] = idx1
    setRowOrder(newOrder)
    setDraggingStarterId(null)
    setPlayerOffsets(prev => ({ ...prev, [id1]: { x: 0, y: 0 }, [id2]: { x: 0, y: 0 } }))
  }

  async function saveStarters() {
    if (starterIds.size !== 11) return
    setSaving(true)
    await fetch('/api/fantasy/starters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starter_ids: [...starterIds], formation: formation?.name }),
    })
    setSaving(false)
    setEditMode(false)
  }

  // 移籍市場の開閉判定（statusに依存せず時刻で判定）
  const now = new Date()
  const nowMs2 = now.getTime()
  // GW終了判定：最終試合 + 3時間（gw_end）が過去であること
  const lastFinishedGw = [...gameweeks]
    .filter(g => {
      const ms = g.gw_end
        ? new Date(g.gw_end).getTime()
        : g.market_open ? new Date(g.market_open).getTime() - 9 * 3600000 : null
      return ms != null && ms <= nowMs2
    })
    .at(-1)
  const nextUpcomingGw = gameweeks.find(g => g.deadline && new Date(g.deadline).getTime() > nowMs2)
  const marketOpen = lastFinishedGw?.market_open ? new Date(lastFinishedGw.market_open) : null
  const nextDeadline = nextUpcomingGw?.deadline ? new Date(nextUpcomingGw.deadline) : null
  const isMarketOpen = marketOpen && now >= marketOpen && (!nextDeadline || now < nextDeadline)

  const fmtDateTime = (iso) => {
    if (!iso) return '-'
    const d = new Date(iso)
    const jst = new Date(d.getTime() + 9 * 3600000)
    return `${jst.getMonth() + 1}/${jst.getDate()} ${String(jst.getHours()).padStart(2, '0')}:${String(jst.getMinutes()).padStart(2, '0')}`
  }

  const teamColor = user?.team_color ?? '#e00000'
  const derivedLastGwNum = lastFinishedGw?.gw_number ?? lastGwNum

  // カウントダウンタイマー: OPEN中→締切まで、CLOSE中→次回オープンまで
  useEffect(() => {
    const target = isMarketOpen ? nextDeadline : marketOpen
    if (!target) { setCountdown(null); return }
    const fmt = () => {
      const diff = target.getTime() - Date.now()
      if (diff <= 0) return setCountdown({ d: 0, h: 0, m: 0, s: 0 })
      const d = Math.floor(diff / 86400000)
      const h = Math.floor((diff % 86400000) / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setCountdown({ d, h, m, s })
    }
    fmt()
    const id = setInterval(fmt, 1000)
    return () => clearInterval(id)
  }, [!!isMarketOpen, nextDeadline?.getTime(), marketOpen?.getTime()])

  async function toggleExpand(playerId) {
    const isOpen = expandedPlayerId === playerId
    setExpandedPlayerId(isOpen ? null : playerId)
    if (!isOpen && playerDetails[playerId] === undefined && lastGwId) {
      setPlayerDetails(prev => ({ ...prev, [playerId]: null }))
      const data = await fetch(`/api/fantasy/gw-detail?gw_id=${lastGwId}&player_id=${playerId}`).then(r => r.json())
      setPlayerDetails(prev => ({ ...prev, [playerId]: data.fixtures ?? [] }))
    }
  }

  if (loading) return <FantasyLoading />
  if (!user) { router.push('/fantasy/setup'); return null }

  // ランキング表示行を計算（TOP10 + 自分の前後5人）
  const TOP_N = 10
  const AROUND = 5
  const myRank = rankings.find(r => r.id === myId)?.rank ?? null
  const top10 = rankings.filter(r => r.rank <= TOP_N)
  let rankingDisplayRows
  if (!myRank || myRank <= TOP_N) {
    rankingDisplayRows = top10
  } else {
    const minRank = myRank - AROUND
    const neighborhood = rankings.filter(r => r.rank >= minRank && r.rank <= myRank + AROUND)
    const needsSeparator = minRank > TOP_N + 1
    rankingDisplayRows = needsSeparator ? [...top10, null, ...neighborhood] : [...top10, ...neighborhood.filter(r => r.rank > TOP_N)]
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>

      {/* ヘッダー */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 12, letterSpacing: '0.15em', color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase' }}>Fantasy J.League</p>
        <h1 style={{ fontSize: 36, fontWeight: 900, color: teamColor, margin: 0, lineHeight: 1.1 }}>
          {user?.team_name}
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', margin: '10px 0 0' }}>{user?.username}</p>
      </div>

      {/* GWスケジュール */}
      {gameweeks.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase' }}>Schedule</p>
          <WeekCalendar gameweeks={gameweeks} />
        </div>
      )}

      {/* タブ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border-color)', marginBottom: 24 }}>
        {[
          { label: derivedLastGwNum != null ? `GW${derivedLastGwNum}` : '直近節', idx: 0 },
          { label: nextUpcomingGw ? `GW${nextUpcomingGw.gw_number}` : '直後節', idx: 1 },
        ].map(({ label, idx }) => (
          <button
            key={idx}
            onClick={() => setActiveTab(idx)}
            style={{
              padding: '13px 8px',
              fontSize: 13, fontWeight: activeTab === idx ? 700 : 400,
              color: activeTab === idx ? 'var(--text-primary)' : 'var(--text-secondary)',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === idx ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer',
              letterSpacing: '0.03em',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* タブコンテンツ */}
      <div style={{ marginBottom: 40 }}>

        {/* Tab 0: 直近節 - GW結果 */}
        {activeTab === 0 && (
          <div>
            {lastGwPlayers.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', padding: '40px 0' }}>
                {derivedLastGwNum == null ? 'まだ終了したGWがありません' : 'データなし'}
              </p>
            ) : (() => {
              const starters = lastGwPlayers.filter(p => p.is_starter)
              const bench = lastGwPlayers.filter(p => !p.is_starter)
              const starterTotal = starters.reduce((s, p) => s + (p.points ?? 0), 0)
              const BOX_W = 80

              // ポイント数に応じたボックス色
              const ptBox = (pts) => {
                if (pts >= 10) return { bg: '#1b5e20', fg: '#a5d6a7' }
                if (pts >= 6)  return { bg: '#1a3d1a', fg: '#66bb6a' }
                if (pts > 0)   return { bg: '#1a2420', fg: '#4caf50' }
                if (pts < 0)   return { bg: '#3d1010', fg: '#ef5350' }
                return           { bg: '#1a1a1e', fg: '#546e7a' }
              }

              const renderRows = (players, isBench) => players.map(p => {
                const isOpen = expandedPlayerId === p.player_id
                const details = playerDetails[p.player_id]
                const { bg, fg } = ptBox(p.points)
                const clubColor = p.team_color ?? '#444'
                return (
                  <div key={p.player_id}>
                    {/* メイン行 */}
                    <div
                      onClick={() => toggleExpand(p.player_id)}
                      style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', userSelect: 'none' }}
                    >
                      {/* 左端ポイントボックス（ポイント色） */}
                      <div style={{ width: BOX_W, flexShrink: 0, backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 15, fontWeight: 900, color: fg, letterSpacing: '-0.02em' }}>{p.points}</span>
                      </div>
                      {/* 選手情報 */}
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '10px 14px', minWidth: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.06em', width: 28, flexShrink: 0 }}>{p.position}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.name_ja}
                        </span>
                        {p.team_name && (
                          <span style={{ fontSize: 11, color: '#fff', marginLeft: 8, whiteSpace: 'nowrap', flexShrink: 0 }}>
                            / {p.team_name}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* 展開エリア */}
                    {isOpen && (
                      <div style={{ marginBottom: 24 }}>
                        {details === null ? (
                          <div style={{ padding: '10px 14px 10px 94px' }}>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>読み込み中…</span>
                          </div>
                        ) : !details || details.length === 0 ? (
                          <div style={{ padding: '10px 14px 10px 94px' }}>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>出場なし</span>
                          </div>
                        ) : details.flatMap((fx) =>
                          [...fx.events].sort((a, b) => b.pts - a.pts).map((ev, j) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'stretch' }}>
                              <div style={{
                                width: BOX_W, flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                              }}>
                                <span style={{ fontSize: 12, fontWeight: 800, color: ev.pts > 0 ? '#66bb6a' : ev.pts < 0 ? '#ef5350' : 'var(--text-secondary)' }}>
                                  {ev.pts > 0 ? `+${ev.pts}` : ev.pts}
                                </span>
                              </div>
                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '8px 14px' }}>
                                <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{ev.label}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )
              })

              return (
                <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                  {/* ヘッダー: 合計ポイント + チーム名 */}
                  <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ width: BOX_W, flexShrink: 0, backgroundColor: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px 0' }}>
                      <span style={{ fontSize: 20, fontWeight: 900, color: starterTotal > 0 ? 'var(--accent)' : 'var(--text-secondary)', letterSpacing: '-0.02em' }}>{starterTotal}</span>
                    </div>
                    <div style={{ flex: 1, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.08em', marginBottom: 3 }}>GW{derivedLastGwNum}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{user?.team_name}</div>
                      {starters.length === 0 && (
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3, opacity: 0.7 }}>締め切り前にスタメン未登録</div>
                      )}
                    </div>
                  </div>

                  {/* スタメン行 */}
                  {renderRows(starters, false)}

                  {/* BENCH区切り */}
                  {bench.length > 0 && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px 7px 66px', backgroundColor: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Bench</span>
                        <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border-color)' }} />
                      </div>
                      {renderRows(bench, true)}
                    </>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* Tab 1: 直後節 - フォーメーション */}
        {activeTab === 1 && (() => {
          const posOrder = { GK: 1, DF: 2, MF: 3, FW: 4 }
          const sortedBench = [...bench].sort((a, b) => (posOrder[a.position] ?? 9) - (posOrder[b.position] ?? 9))

          const sortByRow = (arr) => [...arr].sort((a, b) => (rowOrder[a.player_id] ?? 0) - (rowOrder[b.player_id] ?? 0))
          const fwPlayers = sortByRow(starterList.filter(p => p.position === 'FW'))
          const mfPlayers = sortByRow(starterList.filter(p => p.position === 'MF'))
          const dfPlayers = sortByRow(starterList.filter(p => p.position === 'DF'))
          const gkPlayers = starterList.filter(p => p.position === 'GK')

          const SLOT_W = 130
          const draggingPlayer = draggingId ? squad.find(s => s.player_id === draggingId) : null
          const draggingStarterPlayer = draggingStarterId ? squad.find(s => s.player_id === draggingStarterId) : null

          const playerCard = (p) => {
            const clubColor = p.team_color ?? '#444'
            const txtColor = textColor(clubColor)
            // ベンチからのドロップ
            const canDropFromBench = editMode && draggingPlayer &&
              ((draggingPlayer.position === 'GK') === (p.position === 'GK'))
            // スタメン同士のドロップ（同じポジション行のみ、自分自身不可）
            const canDropFromStarter = editMode && draggingStarterPlayer &&
              draggingStarterId !== p.player_id &&
              p.position === draggingStarterPlayer.position
            const canDrop = canDropFromBench || canDropFromStarter
            const dimmed = editMode && (draggingPlayer || draggingStarterPlayer) && !canDrop
            return (
              <div
                key={p.player_id}
                onDragOver={canDrop ? (e) => e.preventDefault() : undefined}
                onDrop={canDrop ? () => {
                  if (draggingId) swapPlayers(draggingId, p.player_id)
                  else if (draggingStarterId) swapStarterOrder(draggingStarterId, p.player_id)
                } : undefined}
                style={{
                  position: 'relative',
                  paddingTop: 12,
                  display: 'inline-block',
                  cursor: canDrop ? 'copy' : 'default',
                  opacity: dimmed ? 0.35 : 1,
                  outline: canDrop ? '2px solid var(--accent)' : 'none',
                  transition: 'opacity 0.15s, outline 0.15s',
                }}
              >
                {/* 背番号バッジ */}
                <div style={{
                  position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', zIndex: 1,
                  width: 30, height: 30, borderRadius: '50%',
                  backgroundColor: clubColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: 'rgba(0,0,0,0.6) 0px 2px 2px',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: txtColor, lineHeight: 1 }}>{p.no ?? '?'}</span>
                </div>
                {/* 名前ボックス + ポジションボックス */}
                <div style={{ display: 'inline-flex', flexDirection: 'column', whiteSpace: 'nowrap', position: 'relative', zIndex: 2, boxShadow: 'rgba(0,0,0,0.5) 0px 2px 1px' }}>
                  <div style={{ backgroundColor: clubColor, padding: '3px 7px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: txtColor, letterSpacing: '0.04em' }}>{p.name_ja ?? p.name_en}</span>
                  </div>
                  <div style={{ backgroundColor: '#262626', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 13, padding: '0 5px', gap: 6 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#e7e7e7', letterSpacing: '0.1em' }}>{p.position}</span>
                    {nextOpponents[p.team_id] && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 2, lineHeight: 1 }}>
                        <span style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.3)' }}>vs</span>
                        <span style={{ fontSize: 8, fontWeight: 700, color: '#e7e7e7', whiteSpace: 'nowrap' }}>{nextOpponents[p.team_id].abbr}</span>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: nextOpponents[p.team_id].color ?? '#888', flexShrink: 0, display: 'inline-block' }} />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          }

          const formationRow = (players) => (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: 40 }}>
              {players.map(p => {
                const off = playerOffsets[p.player_id] ?? { x: 0, y: 0 }
                const isMoving = posEditId === p.player_id
                return (
                  <div
                    key={p.player_id}
                    draggable={editMode}
                    onDragStart={editMode ? (e) => { e.stopPropagation(); setDraggingStarterId(p.player_id) } : undefined}
                    onDragEnd={editMode ? () => setDraggingStarterId(null) : undefined}
                    style={{
                      flex: '0 0 auto',
                      transform: `translate(${off.x}px, ${off.y}px)`,
                      transition: isMoving ? 'none' : 'transform 0.15s ease-out',
                      cursor: posEditMode ? (isMoving ? 'grabbing' : 'grab') : 'default',
                      zIndex: isMoving ? 10 : 1,
                      position: 'relative',
                      userSelect: 'none',
                    }}
                    onMouseDown={posEditMode && p.position !== 'GK' ? (e) => {
                      e.preventDefault()
                      setPosEditId(p.player_id)
                      // ピッチコンテナとカード自身のRectからはみ出ない範囲を計算
                      const pitch = formationRef.current?.getBoundingClientRect()
                      const card = e.currentTarget.getBoundingClientRect()
                      const MARGIN = 4
                      const BADGE_OVERHANG = 14 // 背番号バッジが上に14px飛び出す
                      const minX = off.x + (pitch.left + MARGIN - card.left)
                      const maxX = off.x + (pitch.right - MARGIN - card.right)
                      const minY = off.y + (pitch.top + MARGIN - card.top) + BADGE_OVERHANG
                      const maxY = off.y + (pitch.bottom - MARGIN - card.bottom)
                      dragPosRef.current = { startX: e.clientX, startY: e.clientY, origX: off.x, origY: off.y, minX, maxX, minY, maxY }
                    } : undefined}
                    onDoubleClick={posEditMode && p.position !== 'GK' ? () => setPlayerOffsets(prev => ({ ...prev, [p.player_id]: { x: 0, y: 0 } })) : undefined}
                  >
                    {playerCard(p)}
                  </div>
                )
              })}
            </div>
          )

          return (
            <div style={{ overflow: 'hidden', border: '1px solid var(--border-color)' }}>
              {/* 上段: クラブ名バー（全幅） */}
              <div style={{ backgroundColor: 'rgb(26,26,26)', display: 'flex', alignItems: 'stretch', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#fff', flex: 1, textAlign: 'center', padding: '12px 14px', paddingLeft: 170 + 14 + 80, alignSelf: 'center' }}>{user?.team_name}</span>
                <div style={{ display: 'flex', alignItems: 'stretch', flexShrink: 0 }}>
                  {posEditMode ? (
                    <div style={{ display: 'flex', alignItems: 'stretch' }}>
                      <button
                        onClick={() => { setPlayerOffsets({}); }}
                        style={{ padding: '0 12px', fontSize: 12, fontWeight: 600, backgroundColor: 'transparent', color: 'rgb(0,255,135)', border: 'none', cursor: 'pointer', borderRight: '1px solid rgba(0,255,135,0.2)' }}
                      >
                        リセット
                      </button>
                      <button
                        onClick={async () => {
                          setPosEditMode(false)
                          setPosEditId(null)
                          await fetch('/api/fantasy/offsets', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ offsets: playerOffsets }),
                          })
                        }}
                        style={{ padding: '0 14px', fontSize: 12, fontWeight: 600, backgroundColor: 'rgb(0,255,135)', color: 'rgb(20,20,20)', border: 'none', cursor: 'pointer', minWidth: 60 }}
                      >
                        保存
                      </button>
                    </div>
                  ) : (
                    <>
                      {isMarketOpen && (
                        <button
                          onClick={() => { setNavigatingToStarters(true); router.push('/fantasy/starters') }}
                          disabled={navigatingToStarters}
                          style={{ padding: '0 12px', fontSize: 12, fontWeight: 600, backgroundColor: 'rgb(0,255,135)', color: 'rgb(20,20,20)', border: 'none', cursor: navigatingToStarters ? 'default' : 'pointer', borderRight: '1px solid rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          {navigatingToStarters ? (
                            <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: 'rgb(20,20,20)', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                          ) : 'スタメン編集'}
                        </button>
                      )}
                      <button onClick={() => setPosEditMode(true)} style={{ padding: '0 12px', fontSize: 12, fontWeight: 600, backgroundColor: 'transparent', color: 'rgb(0,255,135)', border: 'none', cursor: 'pointer' }}>エディット</button>
                    </>
                  )}
                </div>
              </div>

              {isMobile ? (
                /* モバイル: スタメン＋ベンチの縦積みリスト */
                (() => {
                  const posOrder = { GK: 1, DF: 2, MF: 3, FW: 4 }
                  const sortedStarters = [...starterList].sort((a, b) => (posOrder[a.position] ?? 9) - (posOrder[b.position] ?? 9))
                  const mobileRow = (p, isBench) => {
                    const clubColor = p.team_color ?? '#444'
                    return (
                      <div key={p.player_id} style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid #1a1a1a' }}>
                        <div style={{ width: 36, flexShrink: 0, backgroundColor: clubColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 900, color: textColor(clubColor) }}>{p.no ?? '?'}</span>
                        </div>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', backgroundColor: isBench ? '#141414' : 'rgb(26,26,26)', minWidth: 0 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.06em', flexShrink: 0, width: 22 }}>{p.position}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: isBench ? 'var(--text-secondary)' : '#f0f0f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name_ja}</span>
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div style={{ backgroundColor: 'rgb(26,26,26)' }}>
                      {sortedStarters.map(p => mobileRow(p, false))}
                      <div style={{ padding: '8px 10px', backgroundColor: '#363636', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Bench</span>
                      </div>
                      {sortedBench.map(p => mobileRow(p, true))}
                    </div>
                  )
                })()
              ) : (
                /* デスクトップ: 2カラム */
                <div style={{ display: 'flex', backgroundColor: 'rgb(26,26,26)' }}>
                  {/* 左カラム: ベンチ */}
                  <div style={{ width: 170, flexShrink: 0, borderRight: '1px solid var(--border-color)' }}>
                    <div style={{ padding: '10px 10px', backgroundColor: '#363636', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Manager</span>
                    </div>
                    <div style={{ height: 60, backgroundColor: 'rgb(26,26,26)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#f0f0f0' }}>{user?.username}</span>
                    </div>
                    <div style={{ padding: '10px 10px', backgroundColor: '#363636', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Bench</span>
                    </div>
                    {sortedBench.map(p => {
                      const clubColor = p.team_color ?? '#444'
                      const isDragging = draggingId === p.player_id
                      return (
                        <div
                          key={p.player_id}
                          draggable={editMode}
                          onDragStart={editMode ? () => setDraggingId(p.player_id) : undefined}
                          onDragEnd={() => setDraggingId(null)}
                          style={{
                            display: 'flex', alignItems: 'stretch',
                            cursor: editMode ? 'grab' : 'default',
                            opacity: isDragging ? 0.4 : 1,
                            outline: editMode && !isDragging ? '1px solid rgba(0,255,135,0.4)' : 'none',
                            transition: 'opacity 0.15s',
                          }}
                        >
                          <div style={{ width: 32, flexShrink: 0, backgroundColor: clubColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 11, fontWeight: 900, color: textColor(clubColor) }}>{p.no ?? '?'}</span>
                          </div>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, padding: '6px 8px', minWidth: 0, backgroundColor: 'rgb(26,26,26)' }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.06em', flexShrink: 0 }}>{p.position}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#f0f0f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name_ja}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* 右カラム: フォーメーション */}
                  <div ref={formationRef} style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden', backgroundImage: 'url(/pitch.png)', backgroundSize: '100% 100%', backgroundPosition: 'center', minHeight: 420 }}>
                    {/* 選手行: 縦方向に均等配置、上下にパディング */}
                    <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '38px 16px 8px' }}>
                      {formationRow(fwPlayers)}
                      {formationRow(mfPlayers)}
                      {formationRow(dfPlayers)}
                      {formationRow(gkPlayers)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* 常時表示: 移籍市場 */}
      <div style={{ padding: '36px 24px 32px', backgroundColor: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)', marginBottom: 16, textAlign: 'center' }}>
        {/* タイトル */}
        <p style={{ fontFamily: '"Anta", sans-serif', fontSize: 40, letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Transfer Market</p>

        {/* OPEN / CLOSE */}
        <div style={{ fontFamily: '"Anta", sans-serif', fontSize: 48, fontWeight: 400, letterSpacing: '0.06em', color: isMarketOpen ? '#4caf50' : 'var(--text-secondary)', lineHeight: 1, marginBottom: 12 }}>
          {isMarketOpen ? 'OPEN' : 'CLOSE'}
        </div>

        {/* カウントダウン */}
        {countdown && (
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginBottom: 28 }}>
            {[{ v: countdown.d, label: 'DAYS' }, { v: countdown.h, label: 'HRS' }, { v: countdown.m, label: 'MIN' }, { v: countdown.s, label: 'SEC' }].map(({ v, label }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: '"Anta", sans-serif', fontSize: 48, fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1, background: 'var(--bg-tertiary)', width: 90, height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {String(v).padStart(2, '0')}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* 移籍資金 + 保有資産 */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginBottom: 24 }}>
          <div>
            <p style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase' }}>補強予算</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{formatBudget(user?.budget ?? 0)}</p>
          </div>
          <div style={{ width: 1, backgroundColor: 'var(--border-color)' }} />
          <div>
            <p style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase' }}>保有選手資産</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{formatBudget((squad.reduce((sum, p) => sum + (p.price ?? 0), 0)) * 10)}</p>
          </div>
        </div>

        {/* 取引ボタン */}
        <Link href="/fantasy/transfer" style={{ textDecoration: 'none', pointerEvents: isMarketOpen ? 'auto' : 'none' }}>
          <button
            disabled={!isMarketOpen}
            style={{
              padding: '12px 48px', borderRadius: 0, fontSize: 15, fontWeight: 800, letterSpacing: '0.08em',
              backgroundColor: isMarketOpen ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: isMarketOpen ? '#000' : 'var(--text-secondary)',
              border: 'none', cursor: isMarketOpen ? 'pointer' : 'not-allowed',
            }}
          >
            取引
          </button>
        </Link>
      </div>

      {/* ランキングモーダル */}
      {rankingModalUser && (
        <div onClick={() => setRankingModalUser(null)} style={{ position: 'fixed', inset: 0, zIndex: 200, backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 960, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            <div style={{ backgroundColor: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: rankingModalUser.team_color ?? 'var(--text-primary)' }}>{rankingModalUser.team_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{rankingModalUser.username}</div>
              </div>
              <button onClick={() => setRankingModalUser(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ backgroundImage: 'url(/pitch.png)', backgroundSize: '100% 100%', minHeight: 420, position: 'relative', overflow: 'hidden' }}>
              {rankingModalSquad === null ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 28, height: 28, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                </div>
              ) : rankingModalSquad.length === 0 ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>スタメン未登録</p>
                </div>
              ) : (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '38px 16px 8px' }}>
                  {['FW','MF','DF','GK'].map(pos => {
                    const players = rankingModalSquad.filter(p => p.position === pos)
                    if (players.length === 0) return null
                    return (
                      <div key={pos} style={{ display: 'flex', justifyContent: 'center', gap: 40, alignItems: 'flex-start' }}>
                        {players.map(p => {
                          const color = p.team_color ?? '#555'
                          const tc = textColor(color)
                          const offX = p.pos_offset_x ?? 0
                          const offY = p.pos_offset_y ?? 0
                          return (
                            <div key={p.player_id} style={{ flex: '0 0 auto', transform: `translate(${offX}px, ${offY}px)`, position: 'relative', paddingTop: 14 }}>
                              <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', width: 30, height: 30, borderRadius: '50%', backgroundColor: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: tc, boxShadow: 'rgba(0,0,0,0.6) 0px 2px 2px', zIndex: 1 }}>
                                {p.no ?? '?'}
                              </div>
                              <div style={{ display: 'inline-flex', flexDirection: 'column', whiteSpace: 'nowrap', boxShadow: 'rgba(0,0,0,0.5) 0px 2px 1px', position: 'relative', zIndex: 2 }}>
                                <div style={{ backgroundColor: color, padding: '3px 7px' }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: tc, letterSpacing: '0.04em' }}>{p.name_ja ?? p.name_en}</span>
                                </div>
                                <div style={{ backgroundColor: '#262626', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 13, padding: '0 5px', gap: 6 }}>
                                  <span style={{ fontSize: 9, fontWeight: 700, color: '#e7e7e7', letterSpacing: '0.1em' }}>{p.position}</span>
                                  {nextOpponents[p.team_id] && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 2, lineHeight: 1 }}>
                                      <span style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.3)' }}>vs</span>
                                      <span style={{ fontSize: 8, fontWeight: 700, color: '#e7e7e7', whiteSpace: 'nowrap' }}>{nextOpponents[p.team_id].abbr}</span>
                                      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: nextOpponents[p.team_id].color ?? '#888', flexShrink: 0, display: 'inline-block' }} />
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 常時表示: ファンタジーランキング */}
      {rankings.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase' }}>Ranking</p>
          <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '28px 1fr 52px',
              padding: '6px 14px', backgroundColor: 'var(--bg-tertiary)',
              fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.05em',
            }}>
              <span>#</span>
              <span>クラブ / 監督</span>
              <span style={{ textAlign: 'right' }}>PT</span>
            </div>
            {rankingDisplayRows.map((row, i) => row === null ? (
              <div key="sep" style={{ padding: '6px 14px', borderTop: '1px solid var(--border-color)', backgroundColor: '#111', textAlign: 'center', fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.1em' }}>· · ·</div>
            ) : (
              <div
                key={row.id}
                onClick={() => {
                  setRankingModalUser(row)
                  setRankingModalSquad(null)
                  fetch(`/api/fantasy/squad/public?user_id=${row.clerk_user_id}`)
                    .then(r => r.json())
                    .then(d => setRankingModalSquad(d.squad ?? []))
                    .catch(() => setRankingModalSquad([]))
                }}
                style={{
                  display: 'grid', gridTemplateColumns: '28px 1fr 52px',
                  padding: '9px 14px',
                  backgroundColor: '#1a1a1a',
                  borderTop: '1px solid var(--border-color)',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>{row.rank}</span>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {row.team_color && <div style={{ width: 4, height: 16, backgroundColor: row.team_color, borderRadius: 1, flexShrink: 0 }} />}
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.team_name}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{row.username}</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, textAlign: 'right', color: 'var(--accent)' }}>{row.total_points}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
