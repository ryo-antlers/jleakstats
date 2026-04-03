'use client'
import { useParams } from 'next/navigation'
import ColorSpinner from '@/app/components/ColorSpinner'

export default function Loading() {
  const { id } = useParams()
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <ColorSpinner type="player" id={id} />
    </div>
  )
}
