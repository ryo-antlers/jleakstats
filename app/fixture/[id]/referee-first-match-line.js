'use client'
import { useState } from 'react'

export default function RefereeFirstMatchLine({ firstMatch, teamId, clubColor, align, isOpen, onToggle }) {
  const [innerOpen, setInnerOpen] = useState(false)
  const open = onToggle ? !!isOpen : innerOpen
  if (!firstMatch) return null

  const isHome = Number(firstMatch.home_team_id) === Number(teamId)
  const myScore = isHome ? Number(firstMatch.home_score) : Number(firstMatch.away_score)
  const oppScore = isHome ? Number(firstMatch.away_score) : Number(firstMatch.home_score)
  const isPK = firstMatch.status === 'PEN' && firstMatch.home_penalty != null && firstMatch.away_penalty != null
  const myPK = isPK ? (isHome ? Number(firstMatch.home_penalty) : Number(firstMatch.away_penalty)) : null
  const oppPK = isPK ? (isHome ? Number(firstMatch.away_penalty) : Number(firstMatch.home_penalty)) : null
  const result = myScore > oppScore ? '○' : myScore < oppScore ? '●' : isPK ? (myPK > oppPK ? '○' : '●') : '△'
  const oppName = isHome ? firstMatch.away_name : firstMatch.home_name
  const jst = new Date(new Date(firstMatch.date).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const dateStr = `${jst.getFullYear()}/${jst.getMonth() + 1}/${jst.getDate()}`
  const scoreStr = `${myScore}-${oppScore}${isPK ? ` (PK ${myPK}-${oppPK})` : ''}`

  const scorerList = Array.isArray(firstMatch.scorers) ? firstMatch.scorers : []
  const hasScorers = scorerList.length > 0
  const toggle = hasScorers ? () => {
    if (onToggle) onToggle()
    else setInnerOpen(v => !v)
  } : undefined
  const clickStyle = { cursor: hasScorers ? 'pointer' : 'default' }

  return (
    <div style={{ marginTop: 2, textAlign: align === 'right' ? 'right' : 'left' }}>
      <span style={{ display: 'block', fontSize: 9, color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>
        初担当：{dateStr} vs{' '}
        <span onClick={toggle} style={clickStyle}>{oppName}</span>
        {' '}{result}{' '}
        <span onClick={toggle} style={{ ...clickStyle, color: 'rgba(255,255,255,0.7)' }}>{scoreStr}</span>
      </span>
      {open && hasScorers && (
        <div style={{ paddingTop: 2, textAlign: align === 'right' ? 'right' : 'left' }}>
          <div style={{ display: 'inline-block', textAlign: 'left' }}>
            <div style={{ marginBottom: 3 }}>
              <span style={{
                display: 'inline-block', backgroundColor: clubColor,
                padding: '1px 8px', fontSize: 8, color: '#fff',
                letterSpacing: '0.1em', fontWeight: 700,
              }}>GOAL</span>
            </div>
            {scorerList.map((g, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 5, fontSize: 10,
                marginBottom: 1,
              }}>
                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.45)', minWidth: 14 }}>{g.position ?? ''}</span>
                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.55)', minWidth: 14 }}>{g.number ?? ''}</span>
                <span style={{ color: '#fff', fontWeight: 600, whiteSpace: 'nowrap' }}>{g.name}</span>
                {g.elapsed != null && (
                  <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)' }}>{g.elapsed}{"'"}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
