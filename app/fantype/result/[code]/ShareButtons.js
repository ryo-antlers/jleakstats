'use client'

/**
 * 結果ページ用のシェアボタン群。
 *  - X (Twitter) Web Intent
 *  - LINE share URL
 *
 * shareText: 「私の FANTYPE は RWUO (覇者) でした。あなたも診断してみよう」など、
 *            呼び出し側で組み立てたメッセージ。シェアURLは現在のページの絶対URLを使う。
 */
export default function ShareButtons({ shareText, code }) {
  function getShareUrl() {
    if (typeof window === 'undefined') return ''
    return window.location.href
  }

  function shareX() {
    const url = getShareUrl()
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}&hashtags=FANTYPE,Jリーグ`
    window.open(intent, '_blank', 'noopener,noreferrer')
  }

  function shareLine() {
    const url = getShareUrl()
    const lineUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`
    window.open(lineUrl, '_blank', 'noopener,noreferrer')
  }

  // 両ボタン共通: 同じ高さ・同じ幅でピル形状に統一
  const btnBase =
    'inline-flex items-center justify-center rounded-full font-semibold text-sm transition-opacity hover:opacity-90 leading-none'
  const btnSize = { height: '36px', width: '72px' }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={shareX}
        className={btnBase}
        style={{ backgroundColor: '#000', color: '#fff', border: 'none', ...btnSize }}
        aria-label={`Xでシェア (${code})`}
      >
        {/* X icon */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2H21.5l-7.59 8.673L23 22h-6.79l-5.32-6.957L4.8 22H1.54l8.118-9.273L1 2h6.91l4.81 6.357L18.244 2zm-1.193 18h1.83L7.04 4H5.084l11.967 16z" />
        </svg>
      </button>
      <button
        type="button"
        onClick={shareLine}
        className={btnBase}
        style={{ backgroundColor: '#06C755', color: '#fff', border: 'none', ...btnSize }}
        aria-label={`LINEでシェア (${code})`}
      >
        LINE
      </button>
    </div>
  )
}
