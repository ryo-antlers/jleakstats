'use client'
import { useEffect, useRef, useState } from 'react'

const GAP = 8 // 2コピー間のスペース(px)
const SPEED = 7.3 // px/秒

export default function ScrollingName({ name, color, tc, width = 94, fontSize = 13, vPad = 3, noScroll = false }) {
  const outerRef = useRef(null)
  const innerRef = useRef(null)
  const [scrollAmount, setScrollAmount] = useState(0)

  useEffect(() => {
    if (noScroll || !outerRef.current || !innerRef.current) return
    const available = outerRef.current.clientWidth - 14
    const textWidth = innerRef.current.scrollWidth
    setScrollAmount(textWidth > available ? textWidth + GAP : 0)
  }, [name, noScroll])

  const duration = scrollAmount > 0 ? (scrollAmount / SPEED).toFixed(1) : 0

  if (noScroll) {
    return (
      <div style={{
        backgroundColor: color,
        padding: `${vPad}px 4px`,
        overflow: 'hidden',
        width,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{ fontSize, fontWeight: 700, color: tc, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1 }}>
          {name}
        </span>
      </div>
    )
  }

  return (
    <div
      ref={outerRef}
      style={{
        backgroundColor: color,
        padding: `${vPad}px 6px`,
        overflow: 'hidden',
        width,
        display: 'flex',
        alignItems: 'center',
        justifyContent: scrollAmount > 0 ? 'flex-start' : 'center',
      }}
    >
      {scrollAmount > 0 ? (
        <span style={{
          display: 'inline-flex',
          whiteSpace: 'nowrap',
          lineHeight: 1,
          animation: `marquee ${duration}s linear infinite`,
          '--marquee-amount': `-${scrollAmount}px`,
        }}>
          <span ref={innerRef} style={{ fontSize, fontWeight: 700, color: tc, letterSpacing: '0.04em', paddingRight: GAP, lineHeight: 1 }}>
            {name}
          </span>
          <span style={{ fontSize, fontWeight: 700, color: tc, letterSpacing: '0.04em', lineHeight: 1 }}>
            {name}
          </span>
        </span>
      ) : (
        <span ref={innerRef} style={{ fontSize, fontWeight: 700, color: tc, letterSpacing: '0.04em', display: 'inline-block', whiteSpace: 'nowrap', lineHeight: 1 }}>
          {name}
        </span>
      )}
    </div>
  )
}
