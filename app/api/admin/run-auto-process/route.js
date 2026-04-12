import { NextResponse } from 'next/server'

export async function POST() {
  const secret = process.env.CRON_SECRET
  // VERCEL_URL is set automatically on Vercel (no protocol prefix)
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

  const res = await fetch(`${base}/api/fantasy/auto-process`, {
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  })
  const data = await res.json()
  return NextResponse.json(data)
}
