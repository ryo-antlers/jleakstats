'use client'
// /rating/[id] 用のタブ切替
//   - 「採点」と「ノート」をタブで分ける (左=採点 / 右=ノート、初期は採点)
//   - state 保存のため両方の中身を常にマウント、display 切替で表示制御
//   - URL hash (#note / #rating) で同期
//   - showRating=false (採点不可) のときはノートのみ表示

import { useState, useEffect, useRef } from 'react'

export default function RatingTabs({ noteContent, ratingContent, showRating = true, defaultTab = 'rating' }) {
  // 順番: 左=採点 / 右=ノート
  // 採点不可 (showRating=false) のときはノートのみ
  const tabs = showRating
    ? [
        { key: 'rating', label: '採点' },
        { key: 'note',   label: 'ノート' },
      ]
    : [
        { key: 'note',   label: 'ノート' },
      ]

  const [active, setActive] = useState(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.slice(1)
      if (tabs.some(t => t.key === hash)) return hash
    }
    if (tabs.some(t => t.key === defaultTab)) return defaultTab
    return tabs[0].key
  })

  const navRef = useRef(null)
  const [underline, setUnderline] = useState({ left: 0, width: 0 })

  // hashchange イベントで同期 (ブラウザの戻る/進む)
  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash.slice(1)
      if (tabs.some(t => t.key === hash)) setActive(hash)
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRating])

  // showRating が false に変わったときに採点タブが選ばれていたらノートへ
  useEffect(() => {
    if (!showRating && active === 'rating') setActive('note')
  }, [showRating, active])

  function handleTabClick(key) {
    setActive(key)
    if (typeof window !== 'undefined') {
      history.replaceState(null, '', `#${key}`)
    }
  }

  // active 変更時にアンダーラインを更新
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const btn = nav.querySelector(`[data-key="${active}"]`)
    if (btn) setUnderline({ left: btn.offsetLeft, width: btn.offsetWidth })
  }, [active, tabs.length])

  return (
    <>
      <nav ref={navRef} style={{
        display: 'flex',
        position: 'relative',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        marginBottom: 28,
        maxWidth: 560, marginInline: 'auto',
      }}>
        {tabs.map(t => {
          const isActive = active === t.key
          return (
            <button
              key={t.key}
              data-key={t.key}
              onClick={() => handleTabClick(t.key)}
              style={{
                flex: '1 1 0',
                padding: '14px 4px',
                background: 'none',
                border: 'none',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.4)',
                fontSize: 13,
                fontWeight: isActive ? 800 : 500,
                letterSpacing: '0.08em',
                cursor: 'pointer',
                transition: 'color 0.2s ease, font-weight 0.2s ease',
                fontFamily: 'inherit',
              }}
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
          transition: 'left 0.32s cubic-bezier(0.4, 0, 0.2, 1), width 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      </nav>

      {/* 両方常に mount。表示は display で制御し、state を保持する */}
      <div style={{ display: active === 'note' ? 'block' : 'none' }}>
        {noteContent}
      </div>
      {showRating && (
        <div style={{ display: active === 'rating' ? 'block' : 'none' }}>
          {ratingContent}
        </div>
      )}
    </>
  )
}
