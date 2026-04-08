'use client'
import { useEffect, useRef, useState } from 'react'

const GAP = 8 // 2コピー間のスペース(px)
const SPEED = 7.3 // px/秒

export default function ScrollingName({ name, color, tc, width = 80 }) {
  const outerRef = useRef(null)
  const innerRef = useRef(null)
  const [scrollAmount, setScrollAmount] = useState(0)

  useEffect(() => {
    if (!outerRef.current || !innerRef.current) return
    const available = outerRef.current.clientWidth - 14
    const textWidth = innerRef.current.scrollWidth
    setScrollAmount(textWidth > available ? textWidth + GAP : 0)
  }, [name])

  const duration = scrollAmount > 0 ? (scrollAmount / SPEED).toFixed(1) : 0

  return (
    <div
      ref={outerRef}
      style={{
        backgroundColor: color,
        padding: '3px 7px',
        overflow: 'hidden',
        width,
        textAlign: scrollAmount > 0 ? 'left' : 'center',
      }}
    >
      {scrollAmount > 0 ? (
        <span style={{
          display: 'inline-flex',
          whiteSpace: 'nowrap',
          animation: `marquee ${duration}s linear infinite`,
          '--marquee-amount': `-${scrollAmount}px`,
        }}>
          <span ref={innerRef} style={{ fontSize: 11, fontWeight: 700, color: tc, letterSpacing: '0.04em', paddingRight: GAP }}>
            {name}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: tc, letterSpacing: '0.04em' }}>
            {name}
          </span>
        </span>
      ) : (
        <span ref={innerRef} style={{ fontSize: 11, fontWeight: 700, color: tc, letterSpacing: '0.04em', display: 'inline-block', whiteSpace: 'nowrap' }}>
          {name}
        </span>
      )}
    </div>
  )
}
