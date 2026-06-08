'use client'
import { useState } from 'react'
import RefereeMatchRow from './referee-match-row'
import RefereeFirstMatchLine from './referee-first-match-line'

function WinRateDonut({ record, clubColor, align }) {
  const { w, d, l, total } = record ?? { w: 0, d: 0, l: 0, total: 0 }
  if (!total) {
    return (
      <div style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.3)', padding: '8px 0' }}>
        該当試合なし
      </div>
    )
  }
  const winPct = (w / total) * 100
  const size = 72
  const cx = size / 2, cy = size / 2
  const R = 28, r = 23
  const polar = (deg, rad) => {
    const a = (deg - 90) * Math.PI / 180
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)]
  }
  const wedge = (s, e) => {
    if (e - s <= 0) return ''
    // 360°ちょうどは単一の SVG 弧で描けないので、ほぼ全周 (359.999°) にして閉じる
    if (e - s >= 360) e = s + 359.999
    const [oxs, oys] = polar(s, R)
    const [oxe, oye] = polar(e, R)
    const [ixe, iye] = polar(e, r)
    const [ixs, iys] = polar(s, r)
    const big = (e - s) > 180 ? 1 : 0
    return `M ${oxs} ${oys} A ${R} ${R} 0 ${big} 1 ${oxe} ${oye} L ${ixe} ${iye} A ${r} ${r} 0 ${big} 0 ${ixs} ${iys} Z`
  }
  const wEnd = (w / total) * 360
  const dEnd = wEnd + (d / total) * 360
  const lEnd = 360
  return (
    <div style={{ display: 'flex', flexDirection: align === 'right' ? 'row-reverse' : 'row', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {w > 0 && <path d={wedge(0, wEnd)} fill={clubColor || '#888'} />}
          {d > 0 && <path d={wedge(wEnd, dEnd)} fill="rgba(255,255,255,0.18)" />}
          {l > 0 && <path d={wedge(dEnd, lEnd)} fill="rgba(255,255,255,0.06)" />}
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1,
        }}>{Math.round(winPct)}%</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, color: 'rgba(255,255,255,0.7)', textAlign: align === 'right' ? 'right' : 'left' }}>
        <span>{`${total}試合`}</span>
        <span style={{ color: 'rgba(255,255,255,0.5)' }}>{`${w}勝 ${d}分 ${l}敗`}</span>
      </div>
    </div>
  )
}

function BaselineLine({ record, baseline, align }) {
  if (!record?.total || !baseline?.total || baseline.minYear == null) return null
  const refPct = (record.w / record.total) * 100
  const basePct = (baseline.w / baseline.total) * 100
  const delta = Math.round(refPct) - Math.round(basePct)
  const span = baseline.minYear === baseline.maxYear
    ? `${baseline.minYear}`
    : `${baseline.minYear}–${baseline.maxYear}`
  const deltaColor = delta > 0 ? '#d76d6d' : delta < 0 ? '#6d9bd7' : 'rgba(255,255,255,0.4)'
  return (
    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textAlign: align, margin: '2px 0 0 0', lineHeight: 1.4 }}>
      <span>{`${span} 全審判平均 ${Math.round(basePct)}%`}</span>
      <span style={{ color: deltaColor, marginLeft: 4 }}>
        {`(${delta > 0 ? '+' : ''}${delta}pt)`}
      </span>
    </div>
  )
}

function Column({ align, teamId, clubColor, record, baseline, firstMatch, history, openKey, setOpenKey }) {
  const firstKey = `${align}-first`
  const rowKey = (i) => `${align}-row-${i}`
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <WinRateDonut record={record} clubColor={clubColor} align={align} />
      <BaselineLine record={record} baseline={baseline} align={align} />
      <RefereeFirstMatchLine
        firstMatch={firstMatch}
        teamId={teamId}
        clubColor={clubColor}
        align={align}
        isOpen={openKey === firstKey}
        onToggle={() => setOpenKey(prev => prev === firstKey ? null : firstKey)}
      />
      <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', margin: '8px 0 2px 0', textAlign: align }}>直近5試合</p>
      <div style={{ borderTop: `1px solid ${clubColor}`, paddingTop: 10 }}>
        {history.map((f, i) => (
          <RefereeMatchRow
            key={i}
            f={f}
            teamId={teamId}
            align={align}
            clubColor={clubColor}
            isOpen={openKey === rowKey(i)}
            onToggle={() => setOpenKey(prev => prev === rowKey(i) ? null : rowKey(i))}
          />
        ))}
        {history.length === 0 && (
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: align }}>データなし</p>
        )}
      </div>
    </div>
  )
}

export default function RefereeSection({
  homeTeamId, awayTeamId, homeColor, awayColor,
  homeRecord, awayRecord,
  homeFirst, awayFirst,
  homeBaseline, awayBaseline,
  homeHistory, awayHistory,
}) {
  const [openKey, setOpenKey] = useState(null)
  return (
    <div className="ha-stack-mobile" style={{ display: 'flex', gap: 16 }}>
      <Column
        align="left" teamId={homeTeamId} clubColor={homeColor}
        record={homeRecord} baseline={homeBaseline} firstMatch={homeFirst} history={homeHistory}
        openKey={openKey} setOpenKey={setOpenKey}
      />
      <Column
        align="left" teamId={awayTeamId} clubColor={awayColor}
        record={awayRecord} baseline={awayBaseline} firstMatch={awayFirst} history={awayHistory}
        openKey={openKey} setOpenKey={setOpenKey}
      />
    </div>
  )
}
