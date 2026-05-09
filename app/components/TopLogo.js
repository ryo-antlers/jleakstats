import Link from 'next/link'

// ページ上部に表示する中央寄せロゴ (押すとトップへ)
// 試合ページ・試合検索ページ・採点ページなどで共通利用
export default function TopLogo({ size = 36, marginBottom = 18 }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom }}>
      <Link href="/" aria-label="トップへ" style={{ display: 'inline-block', lineHeight: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/apple-icon.png"
          alt="J.Leak Stats"
          width={size}
          height={size}
          style={{ display: 'block', borderRadius: 8 }}
        />
      </Link>
    </div>
  )
}
