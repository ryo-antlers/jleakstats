'use client'
import { useState } from 'react'

function TabNav({ active, setActive, eastColor, westColor, round, align }) {
  // align: 'top' (EAST上寄せ) or 'bottom' (EAST下寄せ、逆)
  const isTop = align === 'top'
  return (
    <div className="group-tabs-nav" style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap: 20, height: 80 }}>
      <button
        onClick={() => setActive('WEST')}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
          fontSize: 20, fontWeight: 900, letterSpacing: '0.1em',
          color: westColor, opacity: active === 'WEST' ? 1 : 0.3,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          transition: 'opacity 0.15s',
        }}
      >
        WEST
        <div style={{ height: 3, width: '100%', backgroundColor: active === 'WEST' ? westColor : 'transparent', marginTop: 3 }} />
      </button>

      <div style={{
        width: 90, flexShrink: 0, backgroundColor: '#fff',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>ROUND</span>
        <span style={{ fontSize: 40, fontWeight: 900, color: '#111', lineHeight: 1 }}>{round}</span>
      </div>

      <button
        onClick={() => setActive('EAST')}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: isTop ? 'flex-start' : 'flex-end',
          fontSize: 20, fontWeight: 900, letterSpacing: '0.1em',
          color: eastColor, opacity: active === 'EAST' ? 1 : 0.3,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          transition: 'opacity 0.15s',
        }}
      >
        {isTop && <div style={{ height: 3, width: '100%', backgroundColor: active === 'EAST' ? eastColor : 'transparent', marginBottom: 3 }} />}
        EAST
        {!isTop && <div style={{ height: 3, width: '100%', backgroundColor: active === 'EAST' ? eastColor : 'transparent', marginTop: 3 }} />}
      </button>
    </div>
  )
}

export default function GroupTabs({
  eastContent, westContent,
  bottomEastContent, bottomWestContent,
  eastColor = '#ffffff', westColor = '#ffffff',
  validRound, nextRound,
}) {
  const [active, setActive] = useState('EAST')

  return (
    <div>
      <TabNav active={active} setActive={setActive} eastColor={eastColor} westColor={westColor} round={validRound} align="top" />

      <div style={{ marginTop: 52 }}>
        <div style={{ display: active === 'EAST' ? 'block' : 'none' }}>{eastContent}</div>
        <div style={{ display: active === 'WEST' ? 'block' : 'none' }}>{westContent}</div>
      </div>

      {(bottomEastContent || bottomWestContent) && (
        <>
          <div style={{ marginTop: 80 }}>
            <TabNav active={active} setActive={setActive} eastColor={eastColor} westColor={westColor} round={nextRound} align="top" />
          </div>
          <div style={{ marginTop: 52,marginBottom: 50 }}>
            <div style={{ display: active === 'EAST' ? 'block' : 'none' }}>{bottomEastContent}</div>
            <div style={{ display: active === 'WEST' ? 'block' : 'none' }}>{bottomWestContent}</div>
          </div>
        </>
      )}
    </div>
  )
}
