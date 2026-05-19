'use client'

import { useEffect, useState } from 'react'

// ランダム表示用の候補文字 (カタカナ・ひらがな・漢字を混ぜると "解読中" 感が出る)
const NOISE = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン解読観察分析戦勝負熱狂育成補強'

/**
 * テキストを「ランダム文字スクランブル → 正解文字へ徐々に確定」のアニメで表示し、
 * 一定間隔で繰り返す。
 *
 * @param {string} text       表示するテキスト
 * @param {number} durationMs 1サイクルのアニメ時間 (デフォ 1400ms)
 * @param {number} intervalMs アニメ完了後、次のアニメ開始までの待機時間 (デフォ 6000ms)
 */
export default function DecodeText({ text, className, style, durationMs = 1400, intervalMs = 6000 }) {
  const [display, setDisplay] = useState(() => text)

  useEffect(() => {
    const chars = [...text]
    const total = chars.length
    let raf
    let timer
    let mounted = true

    const runOnce = () => {
      if (!mounted) return
      const startedAt = performance.now()

      const tick = (now) => {
        if (!mounted) return
        const progress = Math.min(1, (now - startedAt) / durationMs)
        const lockedCount = Math.floor(progress * (total + 1))

        const out = chars
          .map((c, i) => {
            if (i < lockedCount) return c
            if (/\s/.test(c)) return c
            return NOISE[Math.floor(Math.random() * NOISE.length)]
          })
          .join('')

        setDisplay(out)

        if (progress < 1) {
          raf = requestAnimationFrame(tick)
        } else {
          setDisplay(text)
          // 完了後 intervalMs 待ってからループ
          timer = setTimeout(runOnce, intervalMs)
        }
      }

      raf = requestAnimationFrame(tick)
    }

    runOnce()
    return () => {
      mounted = false
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [text, durationMs, intervalMs])

  return (
    <span className={className} style={style} aria-label={text}>
      {display}
    </span>
  )
}
