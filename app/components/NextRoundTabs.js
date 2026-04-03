'use client'
import { useState } from 'react'

export default function NextRoundTabs({ nextRound, eastContent, westContent }) {
  const [active, setActive] = useState('EAST')

  return (
    <div>
      <div className="group-tabs-nav" style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap: 20, marginBottom: 24, height: 80 }}>
        <button
          onClick={() => setActive('WEST')}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
            fontSize: 20, fontWeight: 900, letterSpacing: '0.1em',
            color: '#ffffff', opacity: active === 'WEST' ? 1 : 0.3,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            transition: 'opacity 0.15s',
          }}
        >
          WEST
          <div style={{ height: 3, width: '100%', backgroundColor: active === 'WEST' ? '#ffffff' : 'transparent', marginTop: 3 }} />
        </button>

        <div style={{
          width: 90, flexShrink: 0, backgroundColor: '#fff',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>ROUND</span>
          <span style={{ fontSize: 40, fontWeight: 900, color: '#111', lineHeight: 1 }}>{nextRound}</span>
        </div>

        <button
          onClick={() => setActive('EAST')}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
            fontSize: 20, fontWeight: 900, letterSpacing: '0.1em',
            color: '#ffffff', opacity: active === 'EAST' ? 1 : 0.3,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            transition: 'opacity 0.15s',
          }}
        >
          <div style={{ height: 3, width: '100%', backgroundColor: active === 'EAST' ? '#ffffff' : 'transparent', marginBottom: 3 }} />
          EAST
        </button>
      </div>

      <div style={{ display: active === 'EAST' ? 'block' : 'none' }}>{eastContent}</div>
      <div style={{ display: active === 'WEST' ? 'block' : 'none' }}>{westContent}</div>
    </div>
  )
}
