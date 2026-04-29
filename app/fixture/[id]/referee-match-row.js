'use client'
import { useState } from 'react'

function leagueBadgeLabel(leagueId) {
  switch (Number(leagueId)) {
    case 1: return 'J1'
    case 2: return 'J2'
    case 98: return '百年構想'
    case 100: return 'カップ'
    default: return null
  }
}

export default function RefereeMatchRow({ f, teamId, align, clubColor, isOpen, onToggle }) {
  const [innerOpen, setInnerOpen] = useState(false)
  const open = onToggle ? !!isOpen : innerOpen

  const isHome = Number(f.home_team_id) === Number(teamId)
  const myScore = isHome ? Number(f.home_score) : Number(f.away_score)
  const oppScore = isHome ? Number(f.away_score) : Number(f.home_score)
  const isPK = f.status === 'PEN' && f.home_penalty != null && f.away_penalty != null
  const myPK = isPK ? (isHome ? Number(f.home_penalty) : Number(f.away_penalty)) : null
  const oppPK = isPK ? (isHome ? Number(f.away_penalty) : Number(f.home_penalty)) : null
  const result = myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : isPK ? (myPK > oppPK ? 'W' : 'L') : 'D'
  const oppName = isHome ? f.away_name : f.home_name
  const jst = new Date(new Date(f.date).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const dateStr = `${jst.getFullYear()}/${jst.getMonth() + 1}/${jst.getDate()}`
  const badgeColor = result === 'W' ? clubColor : '#555'
  const scoreStr = `${myScore}-${oppScore}${isPK ? ` (PK ${myPK}-${oppPK})` : ''}`
  const compLabel = leagueBadgeLabel(f.league_id)

  const scorerList = Array.isArray(f.scorers) ? f.scorers : []
  const hasScorers = scorerList.length > 0
  const toggle = hasScorers ? () => {
    if (onToggle) onToggle()
    else setInnerOpen(v => !v)
  } : undefined

  const badge = (
    <span style={{
      width: 18, height: 18, borderRadius: 3, backgroundColor: badgeColor,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>{result}</span>
  )
  const compBadge = compLabel ? (
    <span style={{
      fontSize: 8, color: 'rgba(255,255,255,0.4)',
      flexShrink: 0, whiteSpace: 'nowrap', letterSpacing: '0.04em',
    }}>{compLabel}</span>
  ) : null

  const teamSpan = (
    <span
      onClick={toggle}
      style={{
        color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap', flexShrink: 1,
        cursor: hasScorers ? 'pointer' : 'default',
      }}
    >{oppName}</span>
  )
  const scoreSpan = (
    <span
      onClick={toggle}
      style={{
        color: 'rgba(255,255,255,0.8)', flexShrink: 0,
        cursor: hasScorers ? 'pointer' : 'default',
      }}
    >{scoreStr}</span>
  )

  const expansion = open && hasScorers ? (
    <div style={{ paddingTop: 4, paddingBottom: 2, textAlign: align === 'right' ? 'right' : 'left' }}>
      <div style={{ display: 'inline-block', textAlign: 'left' }}>
        <div style={{ marginBottom: 4 }}>
          <span style={{
            display: 'inline-block', backgroundColor: clubColor,
            padding: '1px 8px', fontSize: 9, color: '#fff',
            letterSpacing: '0.1em', fontWeight: 700,
          }}>GOAL</span>
        </div>
        {scorerList.map((g, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
            marginBottom: 1,
          }}>
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.45)', minWidth: 16 }}>{g.position ?? ''}</span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', minWidth: 16 }}>{g.number ?? ''}</span>
            <span style={{ color: '#fff', fontWeight: 600, whiteSpace: 'nowrap' }}>{g.name}</span>
            {g.elapsed != null && (
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>{g.elapsed}{"'"}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  ) : null

  if (align === 'left') {
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12 }}>
          {badge}
          <span style={{ minWidth: 68, fontSize: 10, color: 'rgba(255,255,255,0.8)', flexShrink: 0, whiteSpace: 'nowrap', lineHeight: '18px' }}>{dateStr}</span>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden', minHeight: 18 }}>
              {teamSpan}
              {scoreSpan}
              {compBadge}
            </span>
            {expansion}
          </div>
        </div>
      </div>
    )
  }
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minWidth: 0, overflow: 'hidden', minHeight: 18 }}>
            {compBadge}
            {scoreSpan}
            {teamSpan}
          </span>
          {expansion}
        </div>
        <span style={{ minWidth: 68, fontSize: 10, color: 'rgba(255,255,255,0.8)', flexShrink: 0, whiteSpace: 'nowrap', textAlign: 'right', lineHeight: '18px' }}>{dateStr}</span>
        {badge}
      </div>
    </div>
  )
}
