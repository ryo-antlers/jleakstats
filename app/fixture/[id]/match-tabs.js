'use client'

import { useState, useEffect, useRef } from 'react'

const TABS = [
  { key: 'members',  label: 'メンバー' },
  { key: 'stats',    label: 'スタッツ' },
  { key: 'ratings',  label: '採点' },
  { key: 'posts',    label: '掲示板' },
  { key: 'referee',  label: '審判' },
]

export default function MatchTabs({ members, ratings, stats, posts, referee }) {
  const [active, setActive] = useState('members')
  const navRef = useRef(null)
  const contentRef = useRef(null)
  const [underline, setUnderline] = useState({ left: 0, width: 0 })

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const btn = nav.querySelector(`[data-key="${active}"]`)
    if (btn) setUnderline({ left: btn.offsetLeft, width: btn.offsetWidth })
  }, [active])

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    el.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 260, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    )
  }, [active])

  const contentMap = { members, ratings, stats, posts, referee }
  const content = contentMap[active]

  return (
    <>
      <nav ref={navRef} style={{
        display: 'flex',
        position: 'relative',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        marginBottom: 24,
        overflowX: 'auto',
        overflowY: 'hidden',
        paddingBottom: 2,
      }}>
        {TABS.map(t => {
          const isActive = active === t.key
          return (
            <button
              key={t.key}
              data-key={t.key}
              onClick={() => setActive(t.key)}
              style={{
                flex: '1 1 0',
                minWidth: 60,
                padding: '12px 4px',
                background: 'none',
                border: 'none',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.4)',
                fontSize: 13,
                fontWeight: isActive ? 800 : 500,
                letterSpacing: '0.05em',
                cursor: 'pointer',
                transition: 'color 0.2s ease, font-weight 0.2s ease',
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = 'rgba(255,255,255,0.75)' }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
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
          height: 2,
          backgroundColor: '#fff',
          transition: 'left 0.36s cubic-bezier(0.4, 0, 0.2, 1), width 0.36s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: '0 0 8px rgba(255,255,255,0.3)',
        }} />
      </nav>
      <div ref={contentRef}>
        {content ?? (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 32 }}>データなし</p>
        )}
      </div>
    </>
  )
}
