'use client'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function FantasyHeader() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isMarketOpen, setIsMarketOpen] = useState(false)

  useEffect(() => {
    fetch('/api/fantasy/gameweeks/schedule')
      .then(r => r.json())
      .then(d => {
        const gws = d.gameweeks ?? []
        const now = Date.now()
        const lastFinished = [...gws]
          .filter(g => {
            const ms = g.gw_end
              ? new Date(g.gw_end).getTime()
              : g.market_open ? new Date(g.market_open).getTime() - 9 * 3600000 : null
            return ms != null && ms <= now
          })
          .at(-1)
        const nextUpcoming = gws.find(g => g.deadline && new Date(g.deadline).getTime() > now)
        const marketOpen = lastFinished?.market_open ? new Date(lastFinished.market_open) : null
        const nextDeadline = nextUpcoming?.deadline ? new Date(nextUpcoming.deadline) : null
        const nowDate = new Date()
        setIsMarketOpen(!!(marketOpen && nowDate >= marketOpen && (!nextDeadline || nowDate < nextDeadline)))
      })
      .catch(() => {})
  }, [])

  // setup/new_squad または ?setup=1 では非表示
  if (pathname === '/fantasy/setup' || pathname === '/fantasy/new_squad' || searchParams.get('setup') === '1') return null

  const navItems = [
    { label: 'ホーム', href: '/fantasy' },
    { label: 'データ', href: '/', external: true },
    { label: '移籍', href: '/fantasy/transfer', disabled: !isMarketOpen },
    { label: 'スタメン', href: '/fantasy/starters' },
    { label: '順位表', href: '/fantasy/rankings' },
    { label: 'ガイド', href: '/fantasy/rules' },
    { label: 'クラブ情報', href: '/fantasy/club' },
  ]

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      backgroundColor: '#1a1a1a',
      borderBottom: '1px solid var(--border-color)',
    }}>
      <div style={{
        maxWidth: 960,
        margin: '0 auto',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}>
        {navItems.map(item => {
          const basePath = item.href.split('#')[0]
          const isActive = item.external
            ? false
            : basePath === '/fantasy'
              ? pathname === '/fantasy'
              : pathname === basePath || pathname.startsWith(basePath + '/')

          if (item.disabled) {
            return (
              <span
                key={item.label}
                style={{
                  padding: '12px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  color: '#ffffff',
                  opacity: 0.25,
                  cursor: 'not-allowed',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {item.label}
              </span>
            )
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noopener noreferrer' : undefined}
              style={{
                padding: '12px 14px',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.04em',
                color: isActive ? 'var(--accent)' : '#ffffff',
                textDecoration: 'none',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'color 0.15s',
              }}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
