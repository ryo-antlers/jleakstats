import { ImageResponse } from '@vercel/og'
import { TYPE_META } from '@/lib/fantype/type-meta'

export const runtime = 'edge'

// FANTYPE 結果ページの OGP 画像 (1200×630)
// /api/fantype/og/RWUO などにアクセスすると PNG を返す。
export async function GET(_req, { params }) {
  const { code: rawCode } = await params
  const code = (rawCode ?? '').toUpperCase()
  const type = TYPE_META[code]

  if (!type) {
    return new Response('Not Found', { status: 404 })
  }

  // 4軸 → 文字。左がそのタイプの「+」側で見えるよう、軸ごとに letter を選ぶ。
  const letters = code.split('')

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0c0c0c',
          color: '#ffffff',
          padding: '64px 72px',
          position: 'relative',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Top: brand chip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            color: '#888',
            fontSize: 22,
            letterSpacing: '0.3em',
            fontWeight: 700,
          }}
        >
          <span>FANTYPE</span>
          <span style={{ color: '#444' }}>·</span>
          <span style={{ color: '#666', letterSpacing: '0.2em' }}>J.LEAGUE × 16 TYPES</span>
        </div>

        {/* Code + Nickname */}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 56 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 32,
            }}
          >
            <span
              style={{
                fontSize: 220,
                fontWeight: 900,
                letterSpacing: '-0.04em',
                lineHeight: 1,
                color: '#00ff87',
              }}
            >
              {code}
            </span>
            <span style={{ fontSize: 64, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>
              {type.nickname}
            </span>
          </div>

          {/* 4 letters as small badges */}
          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            {letters.map((l, i) => (
              <span
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  border: '2px solid #00ff87',
                  color: '#00ff87',
                  fontSize: 28,
                  fontWeight: 900,
                }}
              >
                {l}
              </span>
            ))}
          </div>
        </div>

        {/* Tagline */}
        <div
          style={{
            marginTop: 40,
            fontSize: 36,
            fontWeight: 700,
            color: '#dcdcdc',
            lineHeight: 1.3,
            maxWidth: 1000,
          }}
        >
          {type.tagline}
        </div>

        {/* Footer */}
        <div
          style={{
            position: 'absolute',
            left: 72,
            right: 72,
            bottom: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#888',
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '0.08em',
          }}
        >
          <span>あなたも診断してみよう</span>
          <span style={{ color: '#00ff87' }}>jleakstats.com/fantype</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        // CDN にキャッシュ。タイプコードごとに静的。1日キャッシュで十分。
        'cache-control': 'public, max-age=86400, s-maxage=86400',
      },
    },
  )
}
