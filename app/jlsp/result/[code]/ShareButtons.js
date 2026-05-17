'use client'

import { useState } from 'react'

/**
 * 結果ページ用のシェアボタン群。
 *  - X (Twitter) Web Intent
 *  - LINE share URL
 *  - URL コピー
 *
 * shareText: 「私のJLSP診断は RSWF (ドン) でした。あなたも診断してみよう」など、
 *            呼び出し側で組み立てたメッセージ。シェアURLは現在のページの絶対URLを使う。
 */
export default function ShareButtons({ shareText, code }) {
  const [copied, setCopied] = useState(false)

  async function getShareUrl() {
    if (typeof window === 'undefined') return ''
    return window.location.href
  }

  async function copyUrl() {
    const url = await getShareUrl()
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // フォールバック: 古いブラウザ
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  async function shareX() {
    const url = await getShareUrl()
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}&hashtags=JLSP診断,Jリーグ`
    window.open(intent, '_blank', 'noopener,noreferrer')
  }

  async function shareLine() {
    const url = await getShareUrl()
    const lineUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`
    window.open(lineUrl, '_blank', 'noopener,noreferrer')
  }

  const btnBase =
    'inline-flex items-center justify-center gap-1.5 rounded-full font-semibold px-4 py-2 text-xs sm:text-sm transition-opacity hover:opacity-90 border'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-500 mr-1">結果をシェア:</span>
      <button
        type="button"
        onClick={shareX}
        className={btnBase}
        style={{ backgroundColor: '#000', color: '#fff', borderColor: '#444' }}
        aria-label={`Xでシェア (${code})`}
      >
        {/* X icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2H21.5l-7.59 8.673L23 22h-6.79l-5.32-6.957L4.8 22H1.54l8.118-9.273L1 2h6.91l4.81 6.357L18.244 2zm-1.193 18h1.83L7.04 4H5.084l11.967 16z" />
        </svg>
        X
      </button>
      <button
        type="button"
        onClick={shareLine}
        className={btnBase}
        style={{ backgroundColor: '#06C755', color: '#fff', borderColor: '#06C755' }}
        aria-label={`LINEでシェア (${code})`}
      >
        LINE
      </button>
      <button
        type="button"
        onClick={copyUrl}
        className={btnBase}
        style={
          copied
            ? { backgroundColor: 'var(--accent)', color: '#000', borderColor: 'var(--accent)' }
            : { backgroundColor: 'transparent', color: '#fff', borderColor: '#444' }
        }
        aria-label="URLをコピー"
      >
        {copied ? '✓ コピーしました' : 'URLをコピー'}
      </button>
    </div>
  )
}
