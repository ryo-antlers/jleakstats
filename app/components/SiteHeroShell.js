'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'

// SiteHero の Client 部分
//   - スクロール状態を IntersectionObserver で検知
//   - 初期 (viewport 最上部): padding を多めに取って余裕のあるレイアウト
//   - スクロール後: padding を縮めてコンパクトに固定 (sticky)
//   - props.profile: SiteHero (Server) から渡されるユーザープロフィール
export default function SiteHeroShell({ profile }) {
  const [scrolled, setScrolled] = useState(false)
  const sentinelRef = useRef(null)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const obs = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { threshold: 1 },
    )
    obs.observe(sentinel)
    return () => obs.disconnect()
  }, [])

  return (
    <>
      {/* sentinel: 初期は viewport 最上部に居て、スクロールで viewport 外に出る */}
      <div ref={sentinelRef} style={{ height: 1 }} />
      <div className="site-hero-wrap" style={{
        position: 'sticky', top: 0, zIndex: 50,
        backgroundColor: 'var(--bg-primary)',
        transition: 'padding 0.2s ease',
        paddingTop: scrolled ? 8 : 42,
        paddingBottom: scrolled ? 8 : 30,
      }}>
        <div className="site-hero-inner" style={{
          maxWidth: 'var(--site-max-width, 1024px)',
          margin: '0 auto',
          padding: '0 16px',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <Link href="/" aria-label="トップへ" style={{
            textDecoration: 'none', display: 'inline-block',
          }}>
            <h1 className="site-title" style={{
              fontWeight: 900, color: '#fff',
              letterSpacing: '0.07em', lineHeight: 1,
              margin: 0,
            }}>
              J.Leak Stats
            </h1>
          </Link>

          <div className="deco-circles" style={{
            position: 'relative', width: 120, height: 131, flexShrink: 0,
          }}>
            <Link
              href="/search"
              className="deco-circle-white"
              style={{
                position: 'absolute', top: 0, right: 0,
                width: 75, height: 75, borderRadius: '50%',
                backgroundColor: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#000', textDecoration: 'none',
                fontSize: 14, fontWeight: 900, letterSpacing: '0.04em',
              }}
            >
              試合検索
            </Link>
            <ProfileBubble profile={profile} />
          </div>
        </div>
      </div>
    </>
  )
}

function normalizeColor(raw) {
  if (!raw) return null
  const v = String(raw).trim()
  if (!v) return null
  return v.startsWith('#') ? v : `#${v}`
}

function textOn(hex) {
  const h = (hex ?? '').replace('#', '')
  if (h.length < 6) return '#fff'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? '#fff' : '#000'
}

function ProfileBubble({ profile }) {
  const sharedStyle = {
    position: 'absolute', top: 56, right: 50,
    width: 75, height: 75, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    textDecoration: 'none', cursor: 'pointer',
    fontWeight: 900, letterSpacing: '0.02em',
  }
  if (!profile) {
    return (
      <Link
        href="/sign-in?redirect_url=/"
        className="deco-circle-red"
        style={{
          ...sharedStyle,
          backgroundColor: '#8b1a1a', color: '#fff',
          fontSize: 16, letterSpacing: '0.08em',
        }}
      >
        Sign in
      </Link>
    )
  }
  const clubColor = normalizeColor(profile.club_color) ?? '#8b1a1a'
  const custom = (profile.avatar_text ?? '').trim()
  let initial = custom
  if (!initial) {
    const src = (profile.display_name ?? '?').trim()
    initial = [...src].slice(0, 2).join('') || '?'
  }
  const profileHref = profile.handle ? `/u/${profile.handle}` : '/rating'
  return (
    <Link
      href={profileHref}
      className="deco-circle-red"
      style={{
        ...sharedStyle,
        backgroundColor: clubColor,
        color: textOn(clubColor),
        fontSize: 18,
      }}
    >
      {initial}
    </Link>
  )
}
