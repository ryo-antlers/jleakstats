'use client'
import { useState, useEffect, useRef } from 'react'

export default function ScorePopup({ oppName, scoreStr, scorers, align = 'left', clubColor = '#555' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const scorerList = scorers ? scorers.split(', ').filter(Boolean) : []
  const hasScorers = scorerList.length > 0

  useEffect(() => {
    if (!open) return
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    document.addEventListener('touchstart', handle)
    return () => {
      document.removeEventListener('mousedown', handle)
      document.removeEventListener('touchstart', handle)
    }
  }, [open])

  return (
    <span
      ref={ref}
      style={{
        position: 'relative', display: 'flex', flex: 1, alignItems: 'center',
        gap: 16, cursor: hasScorers ? 'pointer' : 'default', minWidth: 0,
      }}
      onClick={hasScorers ? () => setOpen(v => !v) : undefined}
    >
      {align === 'left' ? (
        <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          <span style={{ color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>{oppName}</span>
          <span style={{ color: 'rgba(255,255,255,0.8)', flexShrink: 0 }}>{scoreStr}</span>
        </span>
      ) : (
        <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          <span style={{ color: 'rgba(255,255,255,0.8)', flexShrink: 0 }}>{scoreStr}</span>
          <span style={{ color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>{oppName}</span>
        </span>
      )}
      {open && hasScorers && (
        <span style={{
          position: 'absolute',
          ...(align === 'left' ? { left: 0 } : { right: 0 }),
          bottom: 'calc(100% + 6px)',
          backgroundColor: clubColor,
          borderRadius: 6,
          padding: '8px 14px', zIndex: 50,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}>
          <span style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 2, letterSpacing: '0.08em' }}>【GOAL】</span>
          {scorerList.map((name, i) => (
            <span key={i} style={{ display: 'block', fontSize: 12, color: '#fff', whiteSpace: 'nowrap', fontWeight: 600 }}>{name}</span>
          ))}
        </span>
      )}
    </span>
  )
}
