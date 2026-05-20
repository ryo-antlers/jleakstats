'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// トップ ('/') と Fantasy ('/fantasy*') ではフッター非表示
function shouldHide(path) {
  if (!path) return false
  if (path === '/') return true
  if (path.startsWith('/fantasy')) return true
  return false
}

export default function SiteFooter() {
  const pathname = usePathname()
  if (shouldHide(pathname)) return null

  return (
    <footer
      style={{ borderTop: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
      className="text-center text-xs py-4"
    >
      {/* ロゴ (押すとトップへ) */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
        <Link href="/" aria-label="トップへ" style={{ display: 'inline-block', lineHeight: 0 }}>
          <img
            src="/apple-icon.png"
            alt="J.Leak Stats"
            width={40}
            height={40}
            style={{ display: 'block', borderRadius: 8 }}
          />
        </Link>
      </div>
      <div>© 2026 J.Leak Stats · データ提供: API-FOOTBALL</div>
      <div style={{ marginTop: 4, fontSize: '0.9em', opacity: 0.7 }}>
        Reaction icons by{' '}
        <a href="https://openmoji.org/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)' }}>
          OpenMoji
        </a>
        {' '}(CC BY-SA 4.0)
      </div>
      <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
        <Link href="/fantype" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 700 }}>
          FANTYPE
        </Link>
        <Link href="/notes" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 700 }}>
          観戦ノート
        </Link>
        <a href="/privacy" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
          プライバシーポリシー
        </a>
        <a href="/contact" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
          お問い合わせ
        </a>
      </div>
    </footer>
  )
}
