'use client'
import { useEffect, useRef, useState } from 'react'

export default function ScrollingName({ name, color, tc, width = 80 }) {
  const outerRef = useRef(null)
  const innerRef = useRef(null)
  const [overflowPx, setOverflowPx] = useState(0)

  useEffect(() => {
    if (!outerRef.current || !innerRef.current) return
    const overflow = innerRef.current.scrollWidth - outerRef.current.clientWidth
    setOverflowPx(overflow > 2 ? overflow : 0)
  }, [name])

  return (
    <div
      ref={outerRef}
      style={{ backgroundColor: color, padding: '3px 7px', overflow: 'hidden', width }}
    >
      <span
        ref={innerRef}
        style={{
          fontSize: 11, fontWeight: 700, color: tc, letterSpacing: '0.04em',
          display: 'inline-block', whiteSpace: 'nowrap',
          ...(overflowPx > 0 ? {
            animation: 'namescroll 4s ease-in-out infinite',
            '--overflow-x': `-${overflowPx}px`,
          } : {}),
        }}
      >
        {name}
      </span>
    </div>
  )
}
