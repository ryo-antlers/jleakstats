'use client'

import { useState, useEffect, useRef } from 'react'

// 後方互換: 旧APIは {members, ratings, stats, posts, referee} 5つのpropを受ける
// 新API: tabs={[{key, label, content}, ...]}
const LEGACY_TABS = [
  { key: 'members',  label: 'メンバー' },
  { key: 'stats',    label: '試合スタッツ' },
  { key: 'ratings',  label: '選手スタッツ' },
  { key: 'posts',    label: '掲示板' },
  { key: 'referee',  label: '審判' },
]

export default function MatchTabs({ tabs, defaultTab, members, ratings, stats, posts, referee }) {
  // 新API優先
  const tabList = Array.isArray(tabs) && tabs.length > 0
    ? tabs
    : LEGACY_TABS.map(t => ({ ...t, content: { members, stats, ratings, posts, referee }[t.key] }))

  // 初期アクティブタブ: defaultTab > tabList先頭 (URL hash があればそちらが優先される)
  const initialActive = defaultTab && tabList.some(t => t.key === defaultTab)
    ? defaultTab
    : tabList[0]?.key
  const [active, setActive] = useState(initialActive)
  const navRef = useRef(null)
  const contentRef = useRef(null)
  const [underline, setUnderline] = useState({ left: 0, width: 0 })

  // URL hashとタブ状態を同期 (試合ページに飛んで戻ってきた時に元のタブを保持)
  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash.slice(1)
      if (hash && tabList.some(t => t.key === hash)) setActive(hash)
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleTabClick = (key) => {
    setActive(key)
    // history を増やさず hash だけ書き換え (戻る時に1段で済む)
    if (typeof window !== 'undefined') {
      history.replaceState(null, '', `#${key}`)
    }
  }

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

  const activeTab = tabList.find(t => t.key === active)

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
        {tabList.map(t => {
          const isActive = active === t.key
          return (
            <button
              key={t.key}
              data-key={t.key}
              onClick={() => handleTabClick(t.key)}
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
        }} />
      </nav>
      <div ref={contentRef}>
        {activeTab?.content ?? (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 32 }}>データなし</p>
        )}
      </div>
    </>
  )
}
