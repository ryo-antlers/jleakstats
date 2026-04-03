'use client'
import { useState, useEffect } from 'react'

export default function ColorSpinner({ type, id }) {
  const [color, setColor] = useState('rgba(255,255,255,0.5)')

  useEffect(() => {
    if (!id) return
    fetch(`/api/color?type=${type}&id=${id}`)
      .then(r => r.json())
      .then(d => { if (d.color) setColor(d.color) })
      .catch(() => {})
  }, [type, id])

  return (
    <>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: '3px solid rgba(255,255,255,0.12)',
        borderTopColor: color,
        animation: 'spin 0.7s linear infinite',
        transition: 'border-top-color 0.2s',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
