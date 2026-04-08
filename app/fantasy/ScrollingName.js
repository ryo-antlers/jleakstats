'use client'
import { useEffect, useRef, useState } from 'react'

export default function ScrollingName({ name, color, tc, width = 80 }) {
  const outerRef = useRef(null)
  const innerRef = useRef(null)
  const [overflowPx, setOverflowPx] = useState(0)

  useEffect(() => {
    if (!outerRef.current || !innerRef.current) return
    const available = outerRef.current.clientWidth - 14 // 7px padding × 2
    const textWidth = innerRef.current.scrollWidth
    const overflow = textWidth - available
    setOverflowPx(overflow > 2 ? overflow + 7 : 0) // +7 for right breathing room
  }, [name])

  return (
    <div
      ref={outerRef}
      style={{
        backgroundColor: color,
        padding: '3px 7px',
        overflow: 'hidden',
        width,
        textAlign: overflowPx > 0 ? 'left' : 'center',
      }}
    >
      <span
        ref={innerRef}
        style={{
          fontSize: 11, fontWeight: 700, color: tc, letterSpacing: '0.04em',
          display: 'inline-block', whiteSpace: 'nowrap',
          ...(overflowPx > 0 ? {
            animation: 'namescroll 15s linear infinite alternate',
            '--overflow-x': `-${overflowPx}px`,
          } : {}),
        }}
      >
        {name}
      </span>
    </div>
  )
}
