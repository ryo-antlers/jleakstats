'use client'
import { useState } from 'react'

const dotTextColor = (hex) => {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16)
  return (r*299 + g*587 + b*114) / 1000 > 128 ? '#000' : '#fff'
}

// レーダーチャート
export function RadarChart({ homeStats, awayStats, homeColor, awayColor, playerStats = [], homeTeamId, awayTeamId }) {
  if (!homeStats || !awayStats) return null

  const avgRating = (teamId) => {
    const ps = playerStats.filter(p => p.team_id === teamId && p.rating)
    return ps.length ? ps.reduce((s, p) => s + parseFloat(p.rating), 0) / ps.length : 0
  }

  const duelWinRate = (teamId) => {
    const ps = playerStats.filter(p => p.team_id === teamId)
    const total = ps.reduce((s, p) => s + (Number(p.duels_total) || 0), 0)
    const won   = ps.reduce((s, p) => s + (Number(p.duels_won)   || 0), 0)
    return total > 0 ? (won / total) * 100 : 0
  }

  const shotOnRate = (stats) => {
    const total = Number(stats.shots_total) || 0
    const on    = Number(stats.shots_on)    || 0
    return total > 0 ? (on / total) * 100 : 0
  }

  const metrics = [
    { label: 'xG',          home: parseFloat(homeStats.expected_goals)||0, away: parseFloat(awayStats.expected_goals)||0, max: 4 },
    { label: 'シュート総数',    home: Number(homeStats.shots_total)||0,        away: Number(awayStats.shots_total)||0,        max: 30 },
    { label: 'デュエル勝率',   home: duelWinRate(homeTeamId),                 away: duelWinRate(awayTeamId),                 max: 100 },
    { label: '支配率',        home: parseFloat(homeStats.possession)||0,      away: parseFloat(awayStats.possession)||0,     max: 100 },
    { label: 'パス成功率',     home: parseFloat(homeStats.passes_pct)||0,     away: parseFloat(awayStats.passes_pct)||0,     max: 100 },
    { label: 'レーティング平均値',   home: avgRating(homeTeamId),                   away: avgRating(awayTeamId),                   max: 10 },
  ]
  const norm = metrics.map(m => ({
    ...m, hn: Math.min(m.home / m.max, 1), an: Math.min(m.away / m.max, 1),
  }))
  const n = norm.length
  const cx = 150, cy = 155, r = 100
  const angle = (i) => -Math.PI / 2 + (2 * Math.PI / n) * i
  const pt = (i, ratio) => [cx + r * ratio * Math.cos(angle(i)), cy + r * ratio * Math.sin(angle(i))]
  const pts = (fn) => norm.map((m, i) => pt(i, fn(m)).join(',')).join(' ')

  const rings = [0.25, 0.5, 0.75, 1]
  // 目盛りラベルを表示する軸のインデックス（上 = 0番目 = xG）
  const tickAxisIdx = 0

  return (
    <svg viewBox="0 0 300 310" style={{ width: '100%', height: 'auto' }}>
      {rings.map(rv => (
        <polygon key={rv} points={norm.map((_, i) => pt(i, rv).join(',')).join(' ')}
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      ))}
      {norm.map((_, i) => {
        const [x, y] = pt(i, 1)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      })}
      {/* 目盛りラベル: 全軸 × 全リング */}
      {norm.map((m, i) => {
        const ang = angle(i)
        const isLeft = Math.cos(ang) < -0.1
        return rings.map(rv => {
          const val = m.max * rv
          const label = Number.isInteger(val) ? val : val.toFixed(1)
          const [x, y] = pt(i, rv)
          const ox = Math.cos(ang) * 5
          const oy = Math.sin(ang) * 5
          return (
            <text key={`${i}-${rv}`} x={x + ox} y={y + oy}
              textAnchor={isLeft ? 'end' : 'start'} dominantBaseline="middle"
              style={{ fontSize: 6.5, fill: 'rgba(255,255,255,0.3)', fontFamily: 'inherit' }}>
              {label}
            </text>
          )
        })
      })}
      <polygon points={pts(m => m.an)} fill={awayColor} fillOpacity="0.25" stroke={awayColor} strokeWidth="1.5" />
      <polygon points={pts(m => m.hn)} fill={homeColor} fillOpacity="0.25" stroke={homeColor} strokeWidth="1.5" />
      {norm.map((m, i) => {
        const isDiag = i !== 0 && i !== 3
        const labelR = isDiag ? 1.30 : 1.22
        const [x, y] = pt(i, labelR)
        const rotations = [0, 45, -45, 0, 45, -45]
        const rot = rotations[i]
        return (
          <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            transform={`rotate(${rot}, ${x}, ${y})`}
            style={{ fontSize: 7, fill: 'rgba(255,255,255,0.55)', fontFamily: 'inherit' }}>
            {m.label}
          </text>
        )
      })}
    </svg>
  )
}

// レーティング横棒グラフ
export function RatingChart({ playerStats, homeTeamId, awayTeamId, homeColor, awayColor }) {
  const homePlayers = playerStats.filter(p => p.team_id === homeTeamId && p.rating).sort((a,b) => b.rating - a.rating).slice(0, 14)
  const awayPlayers = playerStats.filter(p => p.team_id === awayTeamId && p.rating).sort((a,b) => b.rating - a.rating).slice(0, 14)
  if (!homePlayers.length && !awayPlayers.length) return null

  const maxLen = Math.max(homePlayers.length, awayPlayers.length)
  const rowH = 20, padT = 8
  const H = padT + rowH * maxLen
  const W = 400
  const barMaxW = 140
  const nameGap = 8  // 名前とバーの間隔
  const maxRating = 10

  const numColor = (bg) => {
    const hex = bg.replace('#','')
    const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16)
    return (r*299 + g*587 + b*114) / 1000 > 128 ? '#000' : '#fff'
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {Array.from({ length: maxLen }).map((_, i) => {
        const hp = homePlayers[i], ap = awayPlayers[i]
        const y = padT + i * rowH + rowH / 2
        return (
          <g key={i}>
            {hp && (() => {
              const bw = (parseFloat(hp.rating) / maxRating) * barMaxW
              return <>
                <rect x={W/2 - bw} y={y - 6} width={bw} height={12} fill={homeColor} />
                <text x={W/2 - bw - nameGap} y={y + 4} textAnchor="end"
                  style={{ fontSize: 8, fill: '#fff', fontFamily: 'inherit' }}>
                  {hp.name_ja ?? hp.player_id}
                </text>
                <text x={W/2 - 4} y={y + 4} textAnchor="end"
                  style={{ fontSize: 8, fontWeight: 700, fill: numColor(homeColor), fontFamily: 'inherit' }}>
                  {parseFloat(hp.rating).toFixed(1)}
                </text>
              </>
            })()}
            {ap && (() => {
              const bw = (parseFloat(ap.rating) / maxRating) * barMaxW
              return <>
                <rect x={W/2} y={y - 6} width={bw} height={12} fill={awayColor} />
                <text x={W/2 + bw + nameGap} y={y + 4} textAnchor="start"
                  style={{ fontSize: 8, fill: '#fff', fontFamily: 'inherit' }}>
                  {ap.name_ja ?? ap.player_id}
                </text>
                <text x={W/2 + 4} y={y + 4} textAnchor="start"
                  style={{ fontSize: 8, fontWeight: 700, fill: numColor(awayColor), fontFamily: 'inherit' }}>
                  {parseFloat(ap.rating).toFixed(1)}
                </text>
              </>
            })()}
          </g>
        )
      })}
    </svg>
  )
}

// シュート×レーティング散布図
export function ShotRatingScatter({ playerStats, homeTeamId, awayTeamId, homeColor, awayColor }) {
  const data = playerStats.filter(p => p.rating && p.minutes > 0)
  if (!data.length) return null

  const W = 400, H = 220
  const pad = { l: 20, r: 20, t: 16, b: 20 }
  const maxShots = Math.max(...data.map(p => Number(p.shots_total)||0), 1)
  const minRating = Math.min(...data.map(p => parseFloat(p.rating)))
  const maxRating = Math.max(...data.map(p => parseFloat(p.rating)))

  const cx = (v) => pad.l + (v / maxShots) * (W - pad.l - pad.r)
  const cy = (v) => pad.t + (maxRating - v) / (maxRating - minRating + 0.1) * (H - pad.t - pad.b)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      <text x={pad.l} y={10} style={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)', fontFamily: 'inherit' }}>↑ レーティング</text>
      <text x={W - pad.r} y={H - 4} textAnchor="end" style={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)', fontFamily: 'inherit' }}>シュート →</text>
      {[...data].sort((a,b) => parseFloat(a.rating)-parseFloat(b.rating)).map((p, i) => {
        const x = cx(Number(p.shots_total)||0)
        const y = cy(parseFloat(p.rating))
        const color = p.team_id === homeTeamId ? homeColor : awayColor
        const showLabel = parseFloat(p.rating) >= 7.5 || (Number(p.goals) > 0)
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="4" fill={color} />
            {showLabel && (
              <text x={x} y={y - 6} textAnchor="middle"
                style={{ fontSize: 7, fill: color, fontFamily: 'inherit', fontWeight: 700 }}>
                {p.name_ja ?? p.player_id}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}


// レーティング×シーズン出場時間散布図
export function RatingMinutesScatter({ playerStats, homeTeamId, awayTeamId, homeColor, awayColor, homeScore, awayScore, homeShort, awayShort }) {
  const [hovered, setHovered] = useState(null)
  const capMin = (m) => { const rem = m % 90; return rem > 0 && rem <= 15 ? m - rem : m }
  const data = playerStats
    .filter(p => p.rating && Number(p.total_minutes) > 0)
    .map(p => ({ ...p, total_minutes: capMin(Number(p.total_minutes)) }))
  if (!data.length) return null

  const winnerTeamId = homeScore > awayScore ? homeTeamId : homeScore < awayScore ? awayTeamId : homeTeamId

  const W = 400, H = 250
  const pad = { l: 32, r: 16, t: 24, b: 32 }
  const maxMin = Math.max(...data.map(p => Number(p.total_minutes)), 1)
  const minRating = 4, maxRating = 10

  const px = (v) => pad.l + (v / maxMin) * (W - pad.l - pad.r)
  const py = (v) => pad.t + (maxRating - v) / (maxRating - minRating) * (H - pad.t - pad.b)

  const sorted = [...data].sort((a, b) => {
    const aW = a.team_id === winnerTeamId ? 1 : 0
    const bW = b.team_id === winnerTeamId ? 1 : 0
    return aW - bW
  })

  const plotX = pad.l, plotY = pad.t
  const plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b
  const steps = 4

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {Array.from({ length: steps - 1 }).map((_, i) => {
        const x = plotX + plotW * (i + 1) / steps
        return <line key={`v${i}`} x1={x} y1={plotY} x2={x} y2={plotY + plotH} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      })}
      {Array.from({ length: steps - 1 }).map((_, i) => {
        const y = plotY + plotH * (i + 1) / steps
        return <line key={`h${i}`} x1={plotX} y1={y} x2={plotX + plotW} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      })}
      <line x1={plotX} y1={plotY} x2={plotX} y2={plotY + plotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <line x1={plotX} y1={plotY + plotH} x2={plotX + plotW} y2={plotY + plotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      {Array.from({ length: steps + 1 }).map((_, i) => {
        const val = Math.round(maxMin * i / steps)
        const x = plotX + plotW * i / steps
        return (
          <text key={`xt${i}`} x={x} y={plotY + plotH + 10} textAnchor="middle"
            style={{ fontSize: 7, fill: 'rgba(255,255,255,0.35)', fontFamily: 'inherit' }}>
            {val}
          </text>
        )
      })}
      {Array.from({ length: steps + 1 }).map((_, i) => {
        const val = (minRating + (maxRating - minRating) * (steps - i) / steps).toFixed(1)
        const y = plotY + plotH * i / steps
        return (
          <text key={`yt${i}`} x={plotX - 4} y={y + 3} textAnchor="end"
            style={{ fontSize: 7, fill: 'rgba(255,255,255,0.35)', fontFamily: 'inherit' }}>
            {val}
          </text>
        )
      })}
      <text x={plotX} y={plotY - 6} style={{ fontSize: 8, fill: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>↑ {homeShort ?? 'HOME'} vs {awayShort ?? 'AWAY'} 機械採点</text>
      <text x={plotX + plotW} y={plotY + plotH + 22} textAnchor="end" style={{ fontSize: 8, fill: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>シーズン出場時間 →</text>
      {sorted.map((p, i) => {
        const x = px(Number(p.total_minutes))
        const y = py(parseFloat(p.rating))
        const color = p.team_id === homeTeamId ? homeColor : awayColor
        return (
          <g key={i} style={{ cursor: 'default' }}
            onPointerEnter={() => setHovered(i)}
            onPointerLeave={() => setHovered(null)}>
            <circle cx={x} cy={y} r="16" fill="transparent" />
            <circle cx={x} cy={y} r="8" fill={color} />
            <text x={x} y={y + 3} textAnchor="middle"
              style={{ fontSize: 6, fill: dotTextColor(color), fontFamily: 'inherit', fontWeight: 700, pointerEvents: 'none' }}>
              {p.number}
            </text>
          </g>
        )
      })}
      {hovered !== null && (() => {
        const p = sorted[hovered]
        const x = px(Number(p.total_minutes))
        const y = py(parseFloat(p.rating))
        const name = p.name_ja ?? String(p.player_id)
        const bw = name.length * 7 + 8
        return (
          <g pointerEvents="none">
            <rect x={x - bw / 2} y={y - 23} width={bw} height={13} fill="#222" rx="2" />
            <text x={x} y={y - 13} textAnchor="middle" dominantBaseline="auto"
              style={{ fontSize: 8, fill: '#fff', fontFamily: 'inherit', fontWeight: 700 }}>
              {name}
            </text>
          </g>
        )
      })()}
    </svg>
  )
}

// デュエル散布図
export function DuelScatter({ playerStats, homeTeamId, awayTeamId, homeColor, awayColor, homeScore, awayScore }) {
  const [hovered, setHovered] = useState(null)
  const data = playerStats.filter(p => Number(p.duels_total) > 0 && Number(p.minutes) >= 30)
  if (!data.length) return null

  const winnerTeamId = homeScore > awayScore ? homeTeamId : homeScore < awayScore ? awayTeamId : homeTeamId

  const W = 400, H = 250
  const pad = { l: 32, r: 16, t: 24, b: 32 }
  const maxTotal = Math.max(...data.map(p => Number(p.duels_total)), 1)
  const maxWon = maxTotal

  const px = (v) => pad.l + (v / maxTotal) * (W - pad.l - pad.r)
  const py = (v) => pad.t + (maxWon - v) / maxWon * (H - pad.t - pad.b)

  const sorted = [...data].sort((a, b) => {
    const aWinner = a.team_id === winnerTeamId ? 1 : 0
    const bWinner = b.team_id === winnerTeamId ? 1 : 0
    return aWinner - bWinner
  })

  const plotX = pad.l, plotY = pad.t
  const plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b
  const steps = 4

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {Array.from({ length: steps - 1 }).map((_, i) => {
        const x = plotX + plotW * (i + 1) / steps
        return <line key={`v${i}`} x1={x} y1={plotY} x2={x} y2={plotY + plotH} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      })}
      {Array.from({ length: steps - 1 }).map((_, i) => {
        const y = plotY + plotH * (i + 1) / steps
        return <line key={`h${i}`} x1={plotX} y1={y} x2={plotX + plotW} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      })}
      <line x1={plotX} y1={plotY} x2={plotX} y2={plotY + plotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <line x1={plotX} y1={plotY + plotH} x2={plotX + plotW} y2={plotY + plotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      {Array.from({ length: steps + 1 }).map((_, i) => {
        const val = Math.round(maxTotal * i / steps)
        const x = plotX + plotW * i / steps
        return (
          <text key={`xt${i}`} x={x} y={plotY + plotH + 10} textAnchor="middle"
            style={{ fontSize: 7, fill: 'rgba(255,255,255,0.35)', fontFamily: 'inherit' }}>
            {val}
          </text>
        )
      })}
      {Array.from({ length: steps + 1 }).map((_, i) => {
        const val = Math.round(maxWon * (steps - i) / steps)
        const y = plotY + plotH * i / steps
        return (
          <text key={`yt${i}`} x={plotX - 4} y={y + 3} textAnchor="end"
            style={{ fontSize: 7, fill: 'rgba(255,255,255,0.35)', fontFamily: 'inherit' }}>
            {val}
          </text>
        )
      })}
      <text x={plotX} y={plotY - 6} style={{ fontSize: 8, fill: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>↑ デュエル勝利数</text>
      <text x={plotX + plotW} y={plotY + plotH + 22} textAnchor="end" style={{ fontSize: 8, fill: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>デュエル総数 →</text>
      {sorted.map((p, i) => {
        const x = px(Number(p.duels_total))
        const y = py(Number(p.duels_won))
        const color = p.team_id === homeTeamId ? homeColor : awayColor
        return (
          <g key={i} style={{ cursor: 'default' }}
            onPointerEnter={() => setHovered(i)}
            onPointerLeave={() => setHovered(null)}>
            <circle cx={x} cy={y} r="16" fill="transparent" />
            <circle cx={x} cy={y} r="8" fill={color} />
            <text x={x} y={y + 3} textAnchor="middle"
              style={{ fontSize: 6, fill: dotTextColor(color), fontFamily: 'inherit', fontWeight: 700, pointerEvents: 'none' }}>
              {p.number}
            </text>
          </g>
        )
      })}
      {hovered !== null && (() => {
        const p = sorted[hovered]
        const x = px(Number(p.duels_total))
        const y = py(Number(p.duels_won))
        const name = p.name_ja ?? String(p.player_id)
        const bw = name.length * 7 + 8
        return (
          <g pointerEvents="none">
            <rect x={x - bw / 2} y={y - 23} width={bw} height={13} fill="#222" rx="2" />
            <text x={x} y={y - 13} textAnchor="middle" dominantBaseline="auto"
              style={{ fontSize: 8, fill: '#fff', fontFamily: 'inherit', fontWeight: 700 }}>
              {name}
            </text>
          </g>
        )
      })()}
    </svg>
  )
}

// パス散布図
export function PassScatter({ playerStats, homeTeamId, awayTeamId, homeColor, awayColor, homeScore, awayScore }) {
  const data = playerStats.filter(p => Number(p.passes_total) > 0 && Number(p.minutes) >= 30)
  if (!data.length) return null

  const winnerTeamId = homeScore > awayScore ? homeTeamId : homeScore < awayScore ? awayTeamId : homeTeamId

  const W = 400, H = 250
  const pad = { l: 32, r: 16, t: 24, b: 32 }
  const maxTotal = Math.max(...data.map(p => Number(p.passes_total)), 1)
  const maxSuccess = Math.max(...data.map(p => Math.round(Number(p.passes_total) * (parseFloat(p.passes_accuracy) || 0) / 100)), 1)

  const px = (v) => pad.l + (v / maxTotal) * (W - pad.l - pad.r)
  const py = (v) => pad.t + (maxSuccess - v) / maxSuccess * (H - pad.t - pad.b)

  const sorted = [...data].sort((a, b) => {
    const aW = a.team_id === winnerTeamId ? 1 : 0
    const bW = b.team_id === winnerTeamId ? 1 : 0
    return aW - bW
  })

  const plotX = pad.l, plotY = pad.t
  const plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b
  const steps = 4

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {Array.from({ length: steps - 1 }).map((_, i) => {
        const x = plotX + plotW * (i + 1) / steps
        return <line key={`v${i}`} x1={x} y1={plotY} x2={x} y2={plotY + plotH} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      })}
      {Array.from({ length: steps - 1 }).map((_, i) => {
        const y = plotY + plotH * (i + 1) / steps
        return <line key={`h${i}`} x1={plotX} y1={y} x2={plotX + plotW} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      })}
      <line x1={plotX} y1={plotY} x2={plotX} y2={plotY + plotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <line x1={plotX} y1={plotY + plotH} x2={plotX + plotW} y2={plotY + plotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      {Array.from({ length: steps + 1 }).map((_, i) => {
        const val = Math.round(maxTotal * i / steps)
        const x = plotX + plotW * i / steps
        return <text key={`xt${i}`} x={x} y={plotY + plotH + 10} textAnchor="middle" style={{ fontSize: 7, fill: 'rgba(255,255,255,0.35)', fontFamily: 'inherit' }}>{val}</text>
      })}
      {Array.from({ length: steps + 1 }).map((_, i) => {
        const val = Math.round(maxSuccess * (steps - i) / steps)
        const y = plotY + plotH * i / steps
        return <text key={`yt${i}`} x={plotX - 4} y={y + 3} textAnchor="end" style={{ fontSize: 7, fill: 'rgba(255,255,255,0.35)', fontFamily: 'inherit' }}>{val}</text>
      })}
      <text x={plotX} y={plotY - 6} style={{ fontSize: 8, fill: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>↑ パス成功数</text>
      <text x={plotX + plotW} y={plotY + plotH + 22} textAnchor="end" style={{ fontSize: 8, fill: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>パス総数 →</text>
      {sorted.map((p, i) => {
        const total = Number(p.passes_total)
        const success = Math.round(total * (parseFloat(p.passes_accuracy) || 0) / 100)
        const x = px(total), y = py(success)
        const color = p.team_id === homeTeamId ? homeColor : awayColor
        const name = p.name_ja ?? String(p.player_id)
        return (
          <g key={i} className="scatter-dot" style={{ cursor: 'pointer' }}>
            <circle cx={x} cy={y} r="8" fill={color} />
            <text x={x} y={y + 3} textAnchor="middle"
              style={{ fontSize: 6, fill: dotTextColor(color), fontFamily: 'inherit', fontWeight: 700, pointerEvents: 'none' }}>
              {p.number}
            </text>
            <text x={x} y={y - 12} textAnchor="middle" className="scatter-label"
              style={{ fontSize: 8, fill: '#fff', fontFamily: 'inherit', fontWeight: 700, pointerEvents: 'none' }}>
              {name}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// パス成功率横棒グラフ
export function PassAccuracyBar({ playerStats, homeTeamId, homeColor, awayColor }) {
  const data = playerStats
    .filter(p => Number(p.passes_total) >= 30 && p.passes_accuracy != null)
    .map(p => ({ ...p, _acc: Number(p.passes_accuracy) / Number(p.passes_total) * 100 }))
    .sort((a, b) => b._acc - a._acc)
    .slice(0, 10)
  if (!data.length) return null

  const estimateWidth = (str) => [...str].reduce((w, c) => w + (c.charCodeAt(0) > 255 ? 9 : 5), 0)
  const nameAreaX = 32, nameAreaW = 100
  const padL = nameAreaX + nameAreaW + 8
  const barZone = 192, padR = 100
  const W = padL + barZone + padR
  const rowH = 26, padT = 32, padB = 4
  const H = padT + rowH * data.length + padB

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      <defs>
        {data.map((p, i) => (
          <clipPath key={i} id={`pab-clip-${i}`}>
            <rect x={nameAreaX} y={padT + i * rowH} width={nameAreaW} height={rowH} />
          </clipPath>
        ))}
      </defs>

      <text x={0} y={13} style={{ fontSize: 9, fill: 'rgba(255,255,255,0.5)', fontFamily: 'inherit', letterSpacing: '0.12em' }}>
        パス成功率 TOP 10
      </text>
      <text x={W} y={13} textAnchor="end" style={{ fontSize: 7.5, fill: 'rgba(255,255,255,0.25)', fontFamily: 'inherit' }}>
        ※ 30パス以上
      </text>
      <line x1={0} y1={20} x2={W} y2={20} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />

      {data.map((p, i) => {
        const color = p.team_id === homeTeamId ? homeColor : awayColor
        const acc = p._acc || 0
        const bw = (acc / 100) * barZone
        const y = padT + i * rowH
        const name = p.name_ja ?? String(p.player_id)
        const nameW = estimateWidth(name)
        const overflow = Math.max(nameW - nameAreaW + 4, 0)

        return (
          <g key={i}>
            {i % 2 === 0 && <rect x={0} y={y} width={W} height={rowH} fill="rgba(255,255,255,0.02)" />}
            <text x={14} y={y + rowH / 2 + 4} style={{ fontSize: 8, fill: 'rgba(255,255,255,0.2)', fontFamily: 'inherit' }}>
              {i + 1}
            </text>
            <rect x={26} y={y + rowH / 2 - 6} width={3} height={12} fill={color} opacity="0.7" />

            {/* 名前エリア（クリップ＋マーキー） */}
            <a href={`/player/${p.player_id}`}>
              <g clipPath={`url(#pab-clip-${i})`} style={{ cursor: 'pointer' }}>
                <text x={nameAreaX + nameAreaW / 2} y={y + rowH / 2 + 4} textAnchor="middle"
                  style={{ fontSize: 9, fill: '#fff', fontFamily: 'inherit' }}>
                  {overflow > 0 && (
                    <animateTransform
                      attributeName="transform"
                      type="translate"
                      values={`0,0; ${-overflow},0; 0,0`}
                      dur={`${2 + overflow * 0.02}s`}
                      repeatCount="indefinite"
                      calcMode="spline"
                      keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
                    />
                  )}
                  {name}
                </text>
              </g>
            </a>

            <rect x={padL} y={y + 7} width={barZone} height={rowH - 14} fill="rgba(255,255,255,0.05)" rx="2" />
            <rect x={padL} y={y + 7} width={bw} height={rowH - 14} fill={color} opacity="0.82" rx="2" />
            <text x={padL + barZone + 8} y={y + rowH / 2 + 4} style={{ fontSize: 10, fontWeight: 700, fill: '#fff', fontFamily: 'inherit' }}>
              {acc.toFixed(1)}%
            </text>
            <text x={W} y={y + rowH / 2 + 4} textAnchor="end" style={{ fontSize: 7.5, fill: 'rgba(255,255,255,0.3)', fontFamily: 'inherit' }}>
              {p.passes_total}本
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ---- 試合前ページ用チャート ----

// 順位推移折れ線グラフ（2クラブハイライト）
export function FixtureRankChart({ allFixtures, allTeams, homeTeamId, awayTeamId, homeColor, awayColor, currentRound, teamStandings = [] }) {
  if (!allFixtures.length || !allTeams.length) return null
  const homeId = Number(homeTeamId), awayId = Number(awayTeamId)
  const homeTeam = allTeams.find(t => Number(t.id) === homeId)
  if (!homeTeam) return null
  const group = homeTeam.group_name
  const groupTeams = allTeams.filter(t => t.group_name === group)

  const rounds = [...new Set(allFixtures.map(f => f.round_number))].sort((a, b) => a - b)
  const points = {}, gd = {}, gf = {}
  for (const t of allTeams) { points[Number(t.id)] = 0; gd[Number(t.id)] = 0; gf[Number(t.id)] = 0 }
  const history = {}

  for (const round of rounds) {
    for (const f of allFixtures.filter(f => f.round_number === round)) {
      if (f.home_score == null || f.away_score == null) continue
      const h = Number(f.home_team_id), a = Number(f.away_team_id)
      if (!(h in points) || !(a in points)) continue
      const hs = Number(f.home_score), as_ = Number(f.away_score)
      gf[h] += hs; gf[a] += as_
      gd[h] += hs - as_; gd[a] += as_ - hs
      if (hs > as_) points[h] += 3
      else if (hs < as_) points[a] += 3
      else if (f.status === 'PEN' && f.home_penalty != null && f.away_penalty != null) {
        if (Number(f.home_penalty) > Number(f.away_penalty)) { points[h] += 2; points[a] += 1 }
        else { points[a] += 2; points[h] += 1 }
      } else { points[h] += 1; points[a] += 1 }
    }
    const sorted = [...groupTeams].sort((a, b) => {
      const pa = points[Number(a.id)] ?? 0, pb = points[Number(b.id)] ?? 0
      if (pb !== pa) return pb - pa
      const gda = gd[Number(a.id)] ?? 0, gdb = gd[Number(b.id)] ?? 0
      if (gdb !== gda) return gdb - gda
      return (gf[Number(b.id)] ?? 0) - (gf[Number(a.id)] ?? 0)
    })
    sorted.forEach((t, i) => {
      const tid = Number(t.id)
      if (!history[tid]) history[tid] = {}
      history[tid][round] = i + 1
    })
  }

  const teamCount = groupTeams.length
  const W = 500, H = 220
  const pad = { l: 8, r: 64, t: 16, b: 20 }
  const plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b
  const maxRound = rounds[rounds.length - 1] ?? 1
  const rx = (r) => pad.l + ((r - 1) / Math.max(maxRound - 1, 1)) * plotW
  const ry = (rank) => pad.t + ((rank - 1) / (teamCount - 1)) * plotH

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {/* 他チーム（薄い線） */}
      {groupTeams.filter(t => Number(t.id) !== homeId && Number(t.id) !== awayId).map(team => {
        const tid = Number(team.id)
        const tr = rounds.filter(r => history[tid]?.[r] != null)
        if (tr.length < 2) return null
        return <polyline key={tid} points={tr.map(r => `${rx(r)},${ry(history[tid][r])}`).join(' ')}
          fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" />
      })}
      {/* 2クラブハイライト */}
      {[{ id: homeId, color: homeColor }, { id: awayId, color: awayColor }].map(({ id, color }) => {
        const team = allTeams.find(t => Number(t.id) === id)
        const tr = rounds.filter(r => history[id]?.[r] != null)
        if (!tr.length) return null
        const last = tr[tr.length - 1]
        const rank = history[id][last]
        return (
          <g key={id}>
            <polyline points={tr.map(r => `${rx(r)},${ry(history[id][r])}`).join(' ')}
              fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={rx(last)} cy={ry(rank)} r="4" fill={color} />
            <text x={rx(last) + 8} y={ry(rank) - 1}
              style={{ fontSize: 9, fill: color, fontFamily: 'inherit', fontWeight: 700 }}>{team?.abbr}  {rank}位</text>
          </g>
        )
      })}
    </svg>
  )
}

// 攻撃レーダーチャート
export function SeasonAttackRadar({ homeStats, awayStats, homeColor, awayColor }) {
  if (!homeStats || !awayStats) return null
  const metrics = [
    { label: 'ゴール数',         home: homeStats.goals_for_per_game, away: awayStats.goals_for_per_game, max: 3 },
    { label: 'シュート数',       home: homeStats.shots_per_game,     away: awayStats.shots_per_game,     max: 20 },
    { label: 'ゴール期待値',     home: homeStats.xg_per_game,        away: awayStats.xg_per_game,        max: 2.5 },
    { label: 'コーナー数',       home: homeStats.corners_per_game,   away: awayStats.corners_per_game,   max: 8 },
    { label: 'パス成功率',       home: homeStats.passes_pct,         away: awayStats.passes_pct,         max: 90 },
    { label: 'ポゼッション率',   home: homeStats.possession,         away: awayStats.possession,         max: 65 },
  ]
  const norm = metrics.map(m => ({ ...m, hn: Math.min(m.home / m.max, 1), an: Math.min(m.away / m.max, 1) }))
  const n = norm.length
  const cx = 150, cy = 155, r = 100
  const angle = (i) => -Math.PI / 2 + (2 * Math.PI / n) * i
  const pt = (i, ratio) => [cx + r * ratio * Math.cos(angle(i)), cy + r * ratio * Math.sin(angle(i))]
  const pts = (fn) => norm.map((m, i) => pt(i, fn(m)).join(',')).join(' ')
  const rings = [0.25, 0.5, 0.75, 1]
  const rotations = [0, 45, -45, 0, 45, -45]
  return (
    <svg viewBox="0 0 300 310" style={{ width: '100%', height: 'auto' }}>
      {rings.map(rv => (
        <polygon key={rv} points={norm.map((_, i) => pt(i, rv).join(',')).join(' ')}
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      ))}
      {norm.map((_, i) => {
        const [x, y] = pt(i, 1)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      })}
      <polygon points={pts(m => m.an)} fill={awayColor} fillOpacity="0.25" stroke={awayColor} strokeWidth="1.5" />
      <polygon points={pts(m => m.hn)} fill={homeColor} fillOpacity="0.25" stroke={homeColor} strokeWidth="1.5" />
      {norm.map((m, i) => {
        const [x, y] = pt(i, i !== 0 && i !== 3 ? 1.18 : 1.13)
        return (
          <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            transform={`rotate(${rotations[i]}, ${x}, ${y})`}
            style={{ fontSize: 9, fill: 'rgba(255,255,255,0.7)', fontFamily: 'inherit' }}>
            {m.label}
          </text>
        )
      })}
    </svg>
  )
}

// 守備レーダーチャート
export function SeasonDefenseRadar({ homeStats, awayStats, homeColor, awayColor }) {
  if (!homeStats || !awayStats) return null
  // 「少ないほど良い」指標は反転（max - value）
  const metrics = [
    { label: '被失点',         home: Math.max(0, 3 - homeStats.goals_against_per_game), away: Math.max(0, 3 - awayStats.goals_against_per_game), max: 3 },
    { label: '被ゴール期待値', home: Math.max(0, 2.5 - homeStats.xga_per_game),          away: Math.max(0, 2.5 - awayStats.xga_per_game),          max: 2.5 },
    { label: 'デュエル勝率',   home: homeStats.duel_win_rate,                             away: awayStats.duel_win_rate,                             max: 1 },
    { label: 'ボール奪取',     home: homeStats.tackles_per_game,                          away: awayStats.tackles_per_game,                          max: 20 },
    { label: 'インターセプト', home: homeStats.interceptions_per_game,                    away: awayStats.interceptions_per_game,                    max: 15 },
    { label: 'ブロック',       home: homeStats.blocks_per_game,                           away: awayStats.blocks_per_game,                           max: 6 },
  ]
  const norm = metrics.map(m => ({ ...m, hn: Math.min(m.home / m.max, 1), an: Math.min(m.away / m.max, 1) }))
  const n = norm.length
  const cx = 150, cy = 155, r = 100
  const angle = (i) => -Math.PI / 2 + (2 * Math.PI / n) * i
  const pt = (i, ratio) => [cx + r * ratio * Math.cos(angle(i)), cy + r * ratio * Math.sin(angle(i))]
  const pts = (fn) => norm.map((m, i) => pt(i, fn(m)).join(',')).join(' ')
  const rings = [0.25, 0.5, 0.75, 1]
  const rotations = [0, 45, -45, 0, 45, -45]
  return (
    <svg viewBox="0 0 300 310" style={{ width: '100%', height: 'auto' }}>
      {rings.map(rv => (
        <polygon key={rv} points={norm.map((_, i) => pt(i, rv).join(',')).join(' ')}
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      ))}
      {norm.map((_, i) => {
        const [x, y] = pt(i, 1)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      })}
      <polygon points={pts(m => m.an)} fill={awayColor} fillOpacity="0.25" stroke={awayColor} strokeWidth="1.5" />
      <polygon points={pts(m => m.hn)} fill={homeColor} fillOpacity="0.25" stroke={homeColor} strokeWidth="1.5" />
      {norm.map((m, i) => {
        const [x, y] = pt(i, i !== 0 && i !== 3 ? 1.18 : 1.13)
        return (
          <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            transform={`rotate(${rotations[i]}, ${x}, ${y})`}
            style={{ fontSize: 9, fill: 'rgba(255,255,255,0.7)', fontFamily: 'inherit' }}>
            {m.label}
          </text>
        )
      })}
    </svg>
  )
}

// シーズン出場時間×平均レーティング散布図
export function SeasonRatingScatter({ players, homeTeamId, awayTeamId, homeColor, awayColor }) {
  const [hovered, setHovered] = useState(null)
  const homeId = Number(homeTeamId)
  const capMin = (m) => { const rem = m % 90; return rem > 0 && rem <= 15 ? m - rem : m }
  const data = players
    .filter(p => p.avg_rating && Number(p.total_minutes) >= 90)
    .map(p => ({ ...p, total_minutes: capMin(Number(p.total_minutes)) }))
  if (!data.length) return null
  const sorted = [...data].sort((a, b) => (Number(a.team_id) === homeId ? 1 : 0) - (Number(b.team_id) === homeId ? 1 : 0))

  const W = 400, H = 250
  const pad = { l: 32, r: 16, t: 24, b: 32 }
  const maxMin = Math.max(...data.map(p => Number(p.total_minutes)), 1)
  const minR = 4, maxR = 10
  const px = (v) => pad.l + (v / maxMin) * (W - pad.l - pad.r)
  const py = (v) => pad.t + (maxR - v) / (maxR - minR) * (H - pad.t - pad.b)
  const plotX = pad.l, plotY = pad.t, plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b
  const steps = 4

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {Array.from({ length: steps - 1 }).map((_, i) => (
        <line key={`v${i}`} x1={plotX + plotW * (i+1)/steps} y1={plotY} x2={plotX + plotW * (i+1)/steps} y2={plotY + plotH} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      ))}
      {Array.from({ length: steps - 1 }).map((_, i) => (
        <line key={`h${i}`} x1={plotX} y1={plotY + plotH * (i+1)/steps} x2={plotX + plotW} y2={plotY + plotH * (i+1)/steps} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      ))}
      <line x1={plotX} y1={plotY} x2={plotX} y2={plotY + plotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <line x1={plotX} y1={plotY + plotH} x2={plotX + plotW} y2={plotY + plotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      {Array.from({ length: steps + 1 }).map((_, i) => (
        <text key={`xt${i}`} x={plotX + plotW * i/steps} y={plotY + plotH + 10} textAnchor="middle"
          style={{ fontSize: 7, fill: 'rgba(255,255,255,0.35)', fontFamily: 'inherit' }}>
          {Math.round(maxMin * i / steps)}
        </text>
      ))}
      {Array.from({ length: steps + 1 }).map((_, i) => (
        <text key={`yt${i}`} x={plotX - 4} y={plotY + plotH * i/steps + 3} textAnchor="end"
          style={{ fontSize: 7, fill: 'rgba(255,255,255,0.35)', fontFamily: 'inherit' }}>
          {(minR + (maxR - minR) * (steps - i) / steps).toFixed(1)}
        </text>
      ))}
      <text x={plotX} y={plotY - 6} style={{ fontSize: 8, fill: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>平均レーティング</text>
      <text x={plotX + plotW} y={plotY + plotH + 22} textAnchor="end" style={{ fontSize: 8, fill: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>出場時間</text>
      {sorted.map((p, i) => {
        const x = px(Number(p.total_minutes)), y = py(parseFloat(p.avg_rating))
        const color = Number(p.team_id) === homeId ? homeColor : awayColor
        return (
          <g key={i} style={{ cursor: 'pointer' }} onPointerEnter={() => setHovered(i)} onPointerLeave={() => setHovered(null)}>
            <circle cx={x} cy={y} r="16" fill="transparent" />
            <circle cx={x} cy={y} r="8" fill={color} />
            <text x={x} y={y + 3} textAnchor="middle"
              style={{ fontSize: 6, fill: dotTextColor(color), fontFamily: 'inherit', fontWeight: 700, pointerEvents: 'none' }}>
              {p.number}
            </text>
          </g>
        )
      })}
      {hovered !== null && (() => {
        const p = sorted[hovered]
        const x = px(Number(p.total_minutes)), y = py(parseFloat(p.avg_rating))
        const name = p.name_ja ?? String(p.player_id)
        const bw = name.length * 7 + 8
        return (
          <g pointerEvents="none">
            <rect x={x - bw/2} y={y - 23} width={bw} height={13} fill="#222" rx="2" />
            <text x={x} y={y - 13} textAnchor="middle" dominantBaseline="auto"
              style={{ fontSize: 8, fill: '#fff', fontFamily: 'inherit', fontWeight: 700 }}>{name}</text>
          </g>
        )
      })()}
    </svg>
  )
}

// シーズンデュエル散布図（総数×勝率）
export function SeasonDuelScatter({ players, homeTeamId, awayTeamId, homeColor, awayColor }) {
  const [hovered, setHovered] = useState(null)
  const homeId = Number(homeTeamId)
  const data = players.filter(p => Number(p.total_duels) >= 10)
  if (!data.length) return null
  const sorted = [...data].sort((a, b) => (Number(a.team_id) === homeId ? 1 : 0) - (Number(b.team_id) === homeId ? 1 : 0))

  const W = 400, H = 250
  const pad = { l: 36, r: 16, t: 24, b: 32 }
  const maxDuels = Math.max(...data.map(p => Number(p.total_duels)), 1)
  const px = (v) => pad.l + (v / maxDuels) * (W - pad.l - pad.r)
  const py = (v) => pad.t + (1 - v) * (H - pad.t - pad.b)
  const plotX = pad.l, plotY = pad.t, plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b
  const steps = 4

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {Array.from({ length: steps - 1 }).map((_, i) => (
        <line key={`v${i}`} x1={plotX + plotW * (i+1)/steps} y1={plotY} x2={plotX + plotW * (i+1)/steps} y2={plotY + plotH} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      ))}
      {Array.from({ length: steps - 1 }).map((_, i) => (
        <line key={`h${i}`} x1={plotX} y1={plotY + plotH * (i+1)/steps} x2={plotX + plotW} y2={plotY + plotH * (i+1)/steps} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      ))}
      <line x1={plotX} y1={plotY} x2={plotX} y2={plotY + plotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <line x1={plotX} y1={plotY + plotH} x2={plotX + plotW} y2={plotY + plotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      {Array.from({ length: steps + 1 }).map((_, i) => (
        <text key={`xt${i}`} x={plotX + plotW * i/steps} y={plotY + plotH + 10} textAnchor="middle"
          style={{ fontSize: 7, fill: 'rgba(255,255,255,0.35)', fontFamily: 'inherit' }}>
          {Math.round(maxDuels * i / steps)}
        </text>
      ))}
      {Array.from({ length: steps + 1 }).map((_, i) => (
        <text key={`yt${i}`} x={plotX - 4} y={plotY + plotH * i/steps + 3} textAnchor="end"
          style={{ fontSize: 7, fill: 'rgba(255,255,255,0.35)', fontFamily: 'inherit' }}>
          {Math.round((1 - i/steps) * 100)}%
        </text>
      ))}
      <text x={plotX} y={plotY - 6} style={{ fontSize: 8, fill: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>デュエル勝率</text>
      <text x={plotX + plotW} y={plotY + plotH + 22} textAnchor="end" style={{ fontSize: 8, fill: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>デュエル総数</text>
      {sorted.map((p, i) => {
        const winRate = Number(p.total_duels) > 0 ? Number(p.total_duels_won) / Number(p.total_duels) : 0
        const x = px(Number(p.total_duels)), y = py(winRate)
        const color = Number(p.team_id) === homeId ? homeColor : awayColor
        return (
          <g key={i} style={{ cursor: 'pointer' }} onPointerEnter={() => setHovered(i)} onPointerLeave={() => setHovered(null)}>
            <circle cx={x} cy={y} r="16" fill="transparent" />
            <circle cx={x} cy={y} r="8" fill={color} />
            <text x={x} y={y + 3} textAnchor="middle"
              style={{ fontSize: 6, fill: dotTextColor(color), fontFamily: 'inherit', fontWeight: 700, pointerEvents: 'none' }}>
              {p.number}
            </text>
          </g>
        )
      })}
      {hovered !== null && (() => {
        const p = sorted[hovered]
        const winRate = Number(p.total_duels) > 0 ? Number(p.total_duels_won) / Number(p.total_duels) : 0
        const x = px(Number(p.total_duels)), y = py(winRate)
        const name = p.name_ja ?? String(p.player_id)
        const bw = name.length * 7 + 8
        return (
          <g pointerEvents="none">
            <rect x={x - bw/2} y={y - 23} width={bw} height={13} fill="#222" rx="2" />
            <text x={x} y={y - 13} textAnchor="middle" dominantBaseline="auto"
              style={{ fontSize: 8, fill: '#fff', fontFamily: 'inherit', fontWeight: 700 }}>{name}</text>
          </g>
        )
      })()}
    </svg>
  )
}

// シーズンパス総数×キーパス散布図
export function SeasonPassScatter({ players, homeTeamId, awayTeamId, homeColor, awayColor }) {
  const [hovered, setHovered] = useState(null)
  const homeId = Number(homeTeamId)
  const data = players.filter(p => Number(p.total_passes) >= 50 && Number(p.total_key_passes) > 0)
  if (!data.length) return null
  const sorted = [...data].sort((a, b) => (Number(a.team_id) === homeId ? 1 : 0) - (Number(b.team_id) === homeId ? 1 : 0))

  const W = 400, H = 250
  const pad = { l: 32, r: 16, t: 24, b: 32 }
  const maxPasses = Math.max(...data.map(p => Number(p.total_passes)), 1)
  const maxKey = Math.max(...data.map(p => Number(p.total_key_passes)), 1)
  const px = (v) => pad.l + (v / maxPasses) * (W - pad.l - pad.r)
  const py = (v) => pad.t + (maxKey - v) / maxKey * (H - pad.t - pad.b)
  const plotX = pad.l, plotY = pad.t, plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b
  const steps = 4

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {Array.from({ length: steps - 1 }).map((_, i) => (
        <line key={`v${i}`} x1={plotX + plotW*(i+1)/steps} y1={plotY} x2={plotX + plotW*(i+1)/steps} y2={plotY+plotH} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      ))}
      {Array.from({ length: steps - 1 }).map((_, i) => (
        <line key={`h${i}`} x1={plotX} y1={plotY+plotH*(i+1)/steps} x2={plotX+plotW} y2={plotY+plotH*(i+1)/steps} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      ))}
      <line x1={plotX} y1={plotY} x2={plotX} y2={plotY+plotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <line x1={plotX} y1={plotY+plotH} x2={plotX+plotW} y2={plotY+plotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      {Array.from({ length: steps + 1 }).map((_, i) => (
        <text key={`xt${i}`} x={plotX+plotW*i/steps} y={plotY+plotH+10} textAnchor="middle"
          style={{ fontSize: 7, fill: 'rgba(255,255,255,0.35)', fontFamily: 'inherit' }}>
          {Math.round(maxPasses * i / steps)}
        </text>
      ))}
      {Array.from({ length: steps + 1 }).map((_, i) => (
        <text key={`yt${i}`} x={plotX-4} y={plotY+plotH*i/steps+3} textAnchor="end"
          style={{ fontSize: 7, fill: 'rgba(255,255,255,0.35)', fontFamily: 'inherit' }}>
          {Math.round(maxKey * (steps-i) / steps)}
        </text>
      ))}
      <text x={plotX} y={plotY-6} style={{ fontSize: 8, fill: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>キーパス数</text>
      <text x={plotX+plotW} y={plotY+plotH+22} textAnchor="end" style={{ fontSize: 8, fill: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>パス総数</text>
      {sorted.map((p, i) => {
        const x = px(Number(p.total_passes)), y = py(Number(p.total_key_passes))
        const color = Number(p.team_id) === homeId ? homeColor : awayColor
        return (
          <g key={i} style={{ cursor: 'pointer' }} onPointerEnter={() => setHovered(i)} onPointerLeave={() => setHovered(null)}>
            <circle cx={x} cy={y} r="16" fill="transparent" />
            <circle cx={x} cy={y} r="8" fill={color} />
            <text x={x} y={y+3} textAnchor="middle"
              style={{ fontSize: 6, fill: dotTextColor(color), fontFamily: 'inherit', fontWeight: 700, pointerEvents: 'none' }}>
              {p.number}
            </text>
          </g>
        )
      })}
      {hovered !== null && (() => {
        const p = sorted[hovered]
        const x = px(Number(p.total_passes)), y = py(Number(p.total_key_passes))
        const name = p.name_ja ?? String(p.player_id)
        const bw = name.length * 7 + 8
        return (
          <g pointerEvents="none">
            <rect x={x-bw/2} y={y-23} width={bw} height={13} fill="#222" rx="2" />
            <text x={x} y={y-13} textAnchor="middle" dominantBaseline="auto"
              style={{ fontSize: 8, fill: '#fff', fontFamily: 'inherit', fontWeight: 700 }}>{name}</text>
          </g>
        )
      })()}
    </svg>
  )
}

// シーズンシュート総数×枠内シュート散布図
export function SeasonShotScatter({ players, homeTeamId, awayTeamId, homeColor, awayColor }) {
  const [hovered, setHovered] = useState(null)
  const homeId = Number(homeTeamId)
  const data = players.filter(p => Number(p.total_shots) >= 2 && Number(p.total_shots_on) > 0)
  if (!data.length) return null
  const sorted = [...data].sort((a, b) => (Number(a.team_id) === homeId ? 1 : 0) - (Number(b.team_id) === homeId ? 1 : 0))

  const W = 400, H = 250
  const pad = { l: 28, r: 16, t: 24, b: 32 }
  const maxShots = Math.max(...data.map(p => Number(p.total_shots)), 1)
  const maxOn = Math.max(...data.map(p => Number(p.total_shots_on)), 1)
  const px = (v) => pad.l + (v / maxShots) * (W - pad.l - pad.r)
  const py = (v) => pad.t + (maxOn - v) / maxOn * (H - pad.t - pad.b)
  const plotX = pad.l, plotY = pad.t, plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b
  const steps = 4

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {Array.from({ length: steps - 1 }).map((_, i) => (
        <line key={`v${i}`} x1={plotX+plotW*(i+1)/steps} y1={plotY} x2={plotX+plotW*(i+1)/steps} y2={plotY+plotH} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      ))}
      {Array.from({ length: steps - 1 }).map((_, i) => (
        <line key={`h${i}`} x1={plotX} y1={plotY+plotH*(i+1)/steps} x2={plotX+plotW} y2={plotY+plotH*(i+1)/steps} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      ))}
      <line x1={plotX} y1={plotY} x2={plotX} y2={plotY+plotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <line x1={plotX} y1={plotY+plotH} x2={plotX+plotW} y2={plotY+plotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      {Array.from({ length: steps + 1 }).map((_, i) => (
        <text key={`xt${i}`} x={plotX+plotW*i/steps} y={plotY+plotH+10} textAnchor="middle"
          style={{ fontSize: 7, fill: 'rgba(255,255,255,0.35)', fontFamily: 'inherit' }}>
          {Math.round(maxShots * i / steps)}
        </text>
      ))}
      {Array.from({ length: steps + 1 }).map((_, i) => (
        <text key={`yt${i}`} x={plotX-4} y={plotY+plotH*i/steps+3} textAnchor="end"
          style={{ fontSize: 7, fill: 'rgba(255,255,255,0.35)', fontFamily: 'inherit' }}>
          {Math.round(maxOn * (steps-i) / steps)}
        </text>
      ))}
      <text x={plotX} y={plotY-6} style={{ fontSize: 8, fill: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>枠内シュート数</text>
      <text x={plotX+plotW} y={plotY+plotH+22} textAnchor="end" style={{ fontSize: 8, fill: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>シュート総数</text>
      {sorted.map((p, i) => {
        const x = px(Number(p.total_shots)), y = py(Number(p.total_shots_on))
        const color = Number(p.team_id) === homeId ? homeColor : awayColor
        return (
          <g key={i} style={{ cursor: 'pointer' }} onPointerEnter={() => setHovered(i)} onPointerLeave={() => setHovered(null)}>
            <circle cx={x} cy={y} r="16" fill="transparent" />
            <circle cx={x} cy={y} r="8" fill={color} />
            <text x={x} y={y+3} textAnchor="middle"
              style={{ fontSize: 6, fill: dotTextColor(color), fontFamily: 'inherit', fontWeight: 700, pointerEvents: 'none' }}>
              {p.number}
            </text>
          </g>
        )
      })}
      {hovered !== null && (() => {
        const p = sorted[hovered]
        const x = px(Number(p.total_shots)), y = py(Number(p.total_shots_on))
        const name = p.name_ja ?? String(p.player_id)
        const bw = name.length * 7 + 8
        return (
          <g pointerEvents="none">
            <rect x={x-bw/2} y={y-23} width={bw} height={13} fill="#222" rx="2" />
            <text x={x} y={y-13} textAnchor="middle" dominantBaseline="auto"
              style={{ fontSize: 8, fill: '#fff', fontFamily: 'inherit', fontWeight: 700 }}>{name}</text>
          </g>
        )
      })()}
    </svg>
  )
}

// 守備貢献横棒グラフ
export function DefenseChart({ playerStats, homeTeamId, awayTeamId, homeColor, awayColor }) {
  const data = playerStats
    .map(p => ({ ...p, defScore: (Number(p.tackles)||0) + (Number(p.interceptions)||0) + (Number(p.blocks)||0) }))
    .filter(p => p.defScore > 0)
    .sort((a, b) => b.defScore - a.defScore)
    .slice(0, 12)
  if (!data.length) return null

  const W = 400, rowH = 20, padL = 90, padR = 50, padT = 8
  const H = padT + rowH * data.length
  const maxScore = data[0].defScore

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {data.map((p, i) => {
        const color = p.team_id === homeTeamId ? homeColor : awayColor
        const bw = (p.defScore / maxScore) * (W - padL - padR)
        const y = padT + i * rowH
        return (
          <g key={i}>
            <text x={padL - 6} y={y + rowH / 2 + 4} textAnchor="end"
              style={{ fontSize: 8, fill: '#fff', fontFamily: 'inherit' }}>
              {p.name_ja ?? p.player_id}
            </text>
            <rect x={padL} y={y + 3} width={bw} height={rowH - 6} fill={color} opacity="0.85" />
            <text x={padL + bw + 4} y={y + rowH / 2 + 4}
              style={{ fontSize: 8, fill: 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}>
              {p.defScore}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
