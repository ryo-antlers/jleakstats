'use client'
// /rating/[id] のデザインラボ (v2)
//   - 3 つの大胆に異なるムードのバリアント
//   - URL ?lab=1..3 で初期 variant 指定、ピル切替で URL も同期
//
// バリアント:
//   1 Editorial      雑誌組版・タイポグラフィ主役 (serif + mono)
//   2 Neon Stadium   電光掲示板・ネオングロウ・ピル多用
//   3 Brutalist Mono 極限ミニマル・モノクローム・ハーフライン

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import VariantEditorial from './variants/v-a-editorial'
import VariantNeon from './variants/v-b-neon'
import VariantBrutalist from './variants/v-c-brutalist'

const VARIANTS = [
  { n: 1, label: 'A', name: 'Editorial',      desc: '雑誌組版 / セリフ + モノ / ladder タイムライン' },
  { n: 2, label: 'B', name: 'Neon Stadium',   desc: '電光掲示板 / ネオングロウピル / 横ティッカー TL' },
  { n: 3, label: 'C', name: 'Brutalist Mono', desc: '極限ミニマル / モノクローム / 細いハーフライン' },
]

function normalizeColor(raw) {
  if (!raw) return '#444'
  const v = String(raw).trim()
  return v.startsWith('#') ? v : `#${v}`
}
function textOn(hex) {
  const h = (hex ?? '').replace('#', '')
  if (h.length < 6) return '#fff'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? '#fff' : '#000'
}

export default function RatingLabView(props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [variant, setVariant] = useState(props.initialVariant ?? 1)

  useEffect(() => {
    const current = Number(searchParams.get('lab')) || 1
    if (current !== variant) {
      const sp = new URLSearchParams(searchParams.toString())
      sp.set('lab', String(variant))
      router.replace(`?${sp.toString()}`, { scroll: false })
    }
  }, [variant, router, searchParams])

  const { fixture, fixtureId } = props
  const homeColor = normalizeColor(fixture.home_color)
  const awayColor = normalizeColor(fixture.away_color)
  const isPK = fixture.status === 'PEN' && fixture.home_penalty != null

  return (
    <div style={{ paddingTop: 14, paddingBottom: 80 }}>
      {/* 切替バー */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        backgroundColor: 'rgba(10,10,10,0.94)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        padding: '10px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        marginBottom: 20,
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 9, fontWeight: 900, letterSpacing: '0.22em',
            color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase',
          }}>Design Lab v2</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {VARIANTS.map(v => (
              <button
                key={v.n}
                onClick={() => setVariant(v.n)}
                title={`${v.name} — ${v.desc}`}
                style={{
                  minWidth: 34, height: 30, borderRadius: 999, paddingInline: 10,
                  border: variant === v.n ? '1px solid #00ff87' : '1px solid rgba(255,255,255,0.18)',
                  backgroundColor: variant === v.n ? 'rgba(0,255,135,0.15)' : 'transparent',
                  color: variant === v.n ? '#00ff87' : 'rgba(255,255,255,0.75)',
                  fontWeight: 800, fontSize: 12, fontFamily: 'inherit',
                  cursor: 'pointer', display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center', gap: 4,
                  transition: 'all 0.12s ease',
                }}
              >
                <span>{v.label}</span>
              </button>
            ))}
          </div>
          <span style={{
            fontSize: 11, color: 'rgba(255,255,255,0.7)',
            fontWeight: 700, letterSpacing: '0.04em',
          }}>{VARIANTS[variant - 1]?.name}</span>
          <Link href={`/rating/${fixtureId}`} style={{
            marginLeft: 'auto', fontSize: 10,
            color: 'rgba(255,255,255,0.45)', textDecoration: 'none',
            letterSpacing: '0.08em',
          }}>ラボ終了 ▸</Link>
        </div>
        <div style={{
          maxWidth: 1100, margin: '6px auto 0',
          fontSize: 10, color: 'rgba(255,255,255,0.4)',
        }}>{VARIANTS[variant - 1]?.desc}</div>
      </div>

      {/* スコアヘッダー (全 variant 共通) */}
      <ScoreHeader fixture={fixture} homeColor={homeColor} awayColor={awayColor} isPK={isPK} />

      {/* バリアント */}
      {variant === 1 && <VariantEditorial {...props} />}
      {variant === 2 && <VariantNeon      {...props} />}
      {variant === 3 && <VariantBrutalist {...props} />}
    </div>
  )
}

function ScoreHeader({ fixture, homeColor, awayColor, isPK }) {
  return (
    <div style={{ maxWidth: 560, margin: '0 auto 24px' }}>
      <div style={{ display: 'flex', marginBottom: 12, alignItems: 'center' }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
            {fixture.home_name ?? fixture.home_short ?? '-'}
          </span>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
            {fixture.away_name ?? fixture.away_short ?? '-'}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex' }}>
        <div style={{ flex: 1, height: 48, backgroundColor: homeColor, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span style={{ fontSize: 26, fontWeight: 900, color: textOn(homeColor), lineHeight: 1 }}>{fixture.home_score ?? 0}</span>
          {isPK && <span style={{ fontSize: 12, fontWeight: 900, color: textOn(homeColor), opacity: 0.7 }}>({fixture.home_penalty})</span>}
        </div>
        <div style={{ flex: 1, height: 48, backgroundColor: awayColor, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          {isPK && <span style={{ fontSize: 12, fontWeight: 900, color: textOn(awayColor), opacity: 0.7 }}>({fixture.away_penalty})</span>}
          <span style={{ fontSize: 26, fontWeight: 900, color: textOn(awayColor), lineHeight: 1 }}>{fixture.away_score ?? 0}</span>
        </div>
      </div>
    </div>
  )
}
