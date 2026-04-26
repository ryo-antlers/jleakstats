'use client'

import { useEffect, useRef } from 'react'

// ホーム/アウェイのチームカラーで背景にぼかしグラデ。スクロール量に応じて translateY と opacity を控えめに変化（パララックス）。
// prefers-reduced-motion: reduce ユーザーには動きを止める
export default function ParallaxBackground({ homeColor, awayColor }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return

    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(() => {
        const y = window.scrollY
        const translate = -y * 0.3
        const opacity = Math.max(0.35, 1 - y / 1200)
        el.style.transform = `translate3d(0, ${translate}px, 0)`
        el.style.opacity = String(opacity)
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const home = homeColor ?? '#444'
  const away = awayColor ?? '#444'

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '110vh',
        zIndex: -1,
        pointerEvents: 'none',
        willChange: 'transform, opacity',
        background: `
          radial-gradient(ellipse 60% 50% at 15% 20%, ${home}55 0%, ${home}00 60%),
          radial-gradient(ellipse 60% 50% at 85% 30%, ${away}55 0%, ${away}00 60%),
          radial-gradient(ellipse 80% 60% at 50% 100%, ${home}22 0%, ${home}00 70%)
        `,
        filter: 'blur(40px) saturate(1.2)',
      }}
    />
  )
}
