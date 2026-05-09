'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth, useUser } from '@clerk/nextjs'

export default function SiteHeader() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth()
  const { user } = useUser()
  const pathname = usePathname()

  const [profile, setProfile] = useState(null)
  const [profileLoaded, setProfileLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!authLoaded || !isSignedIn) {
      setProfile(null)
      setProfileLoaded(authLoaded)
      return
    }
    setProfileLoaded(false)
    fetch('/api/profile', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) { setProfile(d?.profile ?? null); setProfileLoaded(true) } })
      .catch(() => { if (!cancelled) setProfileLoaded(true) })
    return () => { cancelled = true }
  }, [authLoaded, isSignedIn, user?.id, pathname])

  const displayName = profile?.display_name ?? null
  const clubColor = normalizeColor(profile?.club_color) ?? '#444'
  // カスタム文字 (avatar_text) があればそれを優先、なければ表示名の頭文字
  const customAvatar = (profile?.avatar_text ?? '').trim()
  let initial = customAvatar
  if (!initial) {
    const src = (displayName ?? user?.primaryEmailAddress?.emailAddress ?? '?').trim()
    initial = (src[0] ?? '?').toUpperCase()
  }

  const isSearchActive = pathname?.startsWith('/search')
  const isRatingActive = pathname?.startsWith('/rating')

  return (
    <header style={headerStyle}>
      <div className="max-w-5xl mx-auto w-full px-4" style={innerStyle}>
        <Link href="/" style={logoStyle} aria-label="トップへ">
          <img
            src="/apple-icon.png"
            alt="J.Leak Stats"
            width={32}
            height={32}
            style={{ display: 'block', borderRadius: 7 }}
          />
        </Link>

        <nav style={navStyle}>
          <Link
            href="/search"
            style={{
              ...navLinkStyle,
              color: isSearchActive ? '#fff' : 'rgba(255,255,255,0.6)',
            }}
            onMouseEnter={e => { if (!isSearchActive) e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { if (!isSearchActive) e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
          >
            試合検索
            <span style={{
              position: 'absolute', left: 0, right: 0, bottom: -16,
              height: 2, backgroundColor: '#00ff87',
              transform: isSearchActive ? 'scaleX(1)' : 'scaleX(0)',
              transformOrigin: 'left',
              transition: 'transform 0.2s ease',
            }} />
          </Link>
          <Link
            href="/rating"
            style={{
              ...navLinkStyle,
              color: isRatingActive ? '#fff' : 'rgba(255,255,255,0.6)',
            }}
            onMouseEnter={e => { if (!isRatingActive) e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { if (!isRatingActive) e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
          >
            採点
            <span style={{
              position: 'absolute', left: 0, right: 0, bottom: -16,
              height: 2, backgroundColor: '#00ff87',
              transform: isRatingActive ? 'scaleX(1)' : 'scaleX(0)',
              transformOrigin: 'left',
              transition: 'transform 0.2s ease',
            }} />
          </Link>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          {!authLoaded ? (
            <div style={{ width: 32, height: 32 }} />
          ) : !isSignedIn ? (
            <Link href={`/sign-in?redirect_url=${encodeURIComponent(pathname || '/')}`} style={signInBtnStyle}>
              サインイン
            </Link>
          ) : (
            <Link
              href={`/profile-setup?next=${encodeURIComponent(pathname || '/')}`}
              aria-label="プロフィール編集"
              title={displayName ?? 'プロフィール編集'}
              style={{
                width: 32, height: 32, borderRadius: '50%',
                backgroundColor: clubColor,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: textOn(clubColor),
                fontWeight: 800, fontSize: initial.length === 2 ? 11 : 14,
                letterSpacing: initial.length === 2 ? '0.02em' : 0,
                textDecoration: 'none', flexShrink: 0,
                opacity: profileLoaded ? 1 : 0.6,
                transition: 'opacity 0.15s ease, box-shadow 0.15s ease',
                boxShadow: '0 0 0 0 rgba(255,255,255,0)',
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.2)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 0 0 rgba(255,255,255,0)' }}
            >
              {initial}
            </Link>
          )}
        </div>
      </div>
    </header>
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

const headerStyle = {
  width: '100%',
  position: 'sticky',
  top: 0,
  zIndex: 50,
  backgroundColor: 'rgba(20,20,20,0.85)',
  backdropFilter: 'saturate(180%) blur(10px)',
  WebkitBackdropFilter: 'saturate(180%) blur(10px)',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
}

const innerStyle = {
  paddingTop: 14,
  paddingBottom: 14,
  display: 'flex',
  alignItems: 'center',
  gap: 28,
  boxSizing: 'border-box',
}

const logoStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  textDecoration: 'none',
  flexShrink: 0,
  marginRight: 4,
  transition: 'opacity 0.15s ease',
}

const navStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 24,
  flex: 1,
}

const navLinkStyle = {
  position: 'relative',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textDecoration: 'none',
  padding: '4px 0',
  transition: 'color 0.15s ease',
}

const signInBtnStyle = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.1em',
  color: '#000',
  backgroundColor: '#00ff87',
  padding: '8px 16px',
  textDecoration: 'none',
  textTransform: 'uppercase',
}
