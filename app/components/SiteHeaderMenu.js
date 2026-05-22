'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// グローバルヘッダー (Pattern E4 — Pill Active、推しクラブカラー)
//   - 左: 「J Leak Stats」テキストロゴ
//   - 中央: ナビ (試合検索 / 採点 / 観戦ノート / FANTYPE)
//     現在ページのピルは推しクラブカラー (未ログイン or 推しクラブ未設定なら緑にフォールバック)
//   - 右: ユーザーアバター or Sign in
//   - スマホ (≤ 768px): 中央ナビをハンバーガーに折りたたみ
//
// props.profile: { display_name, avatar_text, handle, jersey_number, club_color } | null

const NAV_ITEMS = [
  { href: '/search',  label: '試合検索' },
  { href: '/rating',  label: '採点' },
  { href: '/notes',   label: '観戦ノート' },
  { href: '/fantype', label: 'FANTYPE' },
]

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

function isActive(pathname, href) {
  if (!pathname) return false
  return pathname === href || pathname.startsWith(href + '/')
}

export default function SiteHeaderMenu({ profile }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()

  // アクティブピルの背景色: 推しクラブカラー or 緑フォールバック
  const accent = normalizeColor(profile?.club_color) || '#00ff87'
  const accentText = textOn(accent)

  return (
    <>
      <header className="site-header" style={{
        position: 'sticky', top: 0, zIndex: 50,
        backgroundColor: 'rgba(10,10,10,0.92)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{
          maxWidth: 'var(--site-max-width, 1024px)',
          margin: '0 auto',
          padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          {/* 左: ロゴテキスト */}
          <Link href="/" aria-label="トップへ" style={{
            fontSize: 15, fontWeight: 900, letterSpacing: '0.04em',
            color: '#fff', textDecoration: 'none',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            J Leak Stats
          </Link>

          {/* 中央: PC ナビ (ピル) */}
          <nav className="site-header-nav-desktop" style={{
            flex: 1, display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 4,
          }}>
            {NAV_ITEMS.map(item => {
              const active = isActive(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    fontSize: 12, fontWeight: 800, letterSpacing: '0.06em',
                    padding: '7px 14px',
                    borderRadius: 999,
                    color: active ? accentText : 'rgba(255,255,255,0.7)',
                    backgroundColor: active ? accent : 'transparent',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* 右: アバター + ハンバーガー */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserSlot profile={profile} />
            <button
              type="button"
              className="site-header-hamburger"
              onClick={() => setMenuOpen(o => !o)}
              aria-label={menuOpen ? 'メニューを閉じる' : 'メニューを開く'}
              style={hamburgerStyle}
            >
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {/* スマホ展開メニュー */}
        {menuOpen && (
          <nav className="site-header-nav-mobile" style={{
            borderTop: '1px solid rgba(255,255,255,0.08)',
            padding: '10px 16px 14px',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {NAV_ITEMS.map(item => {
              const active = isActive(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  style={{
                    fontSize: 13, fontWeight: 800, letterSpacing: '0.06em',
                    padding: '10px 14px',
                    borderRadius: 999,
                    color: active ? accentText : 'rgba(255,255,255,0.85)',
                    backgroundColor: active ? accent : 'transparent',
                    textDecoration: 'none',
                  }}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        )}
      </header>

      {/* PC では中央ナビを出し、スマホでは隠す。逆も同様 */}
      <style jsx>{`
        .site-header-nav-desktop { display: flex; }
        .site-header-hamburger { display: none; }
        @media (max-width: 768px) {
          .site-header-nav-desktop { display: none !important; }
          .site-header-hamburger { display: inline-flex !important; }
        }
      `}</style>
    </>
  )
}

function UserSlot({ profile }) {
  if (!profile) {
    return (
      <Link href="/sign-in?redirect_url=/" style={{
        fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
        padding: '6px 12px',
        backgroundColor: '#8b1a1a', color: '#fff',
        textDecoration: 'none', textTransform: 'uppercase',
      }}>
        Sign in
      </Link>
    )
  }
  const handle = profile.handle ?? null
  const href = handle ? `/u/${handle}` : '/rating'
  const clubColor = normalizeColor(profile.club_color) ?? '#444'
  const clubText = textOn(clubColor)
  const customAvatar = (profile.avatar_text ?? '').trim()
  const letters = customAvatar || [...(profile.display_name ?? '?').trim()].slice(0, 2).join('') || '?'
  return (
    <Link href={href} aria-label="マイページへ" style={{
      display: 'block', textDecoration: 'none', flexShrink: 0,
    }}>
      <MiniJersey
        color={clubColor}
        textColor={clubText}
        jerseyNumber={profile.jersey_number}
        avatarLetters={letters}
      />
    </Link>
  )
}

function MiniJersey({ color, textColor, jerseyNumber, avatarLetters }) {
  const hasNumber = jerseyNumber != null
  return (
    <div style={{ position: 'relative', width: 46, height: 32, flexShrink: 0 }}>
      <svg viewBox="0 0 100 70" width="46" height="32" style={{ display: 'block' }}>
        <path
          d="M 38 12 Q 50 16, 62 12 L 78 16 Q 84 18, 82 28 Q 78 34, 70 32 L 70 64 Q 70 66, 68 66 L 32 66 Q 30 66, 30 64 L 30 32 Q 22 34, 18 28 Q 16 18, 22 16 Z"
          fill={color}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        color: textColor, pointerEvents: 'none',
      }}>
        {hasNumber && (
          <div style={{
            fontSize: 11, fontWeight: 900, lineHeight: 1,
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
            paddingTop: 8,
          }}>{jerseyNumber}</div>
        )}
        <div style={{
          fontSize: 5,
          fontWeight: 800,
          marginTop: 1,
          letterSpacing: '0.02em',
        }}>{avatarLetters}</div>
      </div>
    </div>
  )
}

const hamburgerStyle = {
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.15)',
  color: '#fff',
  width: 34, height: 32,
  cursor: 'pointer',
  fontSize: 14, lineHeight: 1,
  alignItems: 'center', justifyContent: 'center',
  fontFamily: 'inherit',
}
