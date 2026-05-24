// 観戦タイムラインの読み取り専用表示
//   - 5 つの表示モードに対応 (mode prop)
//   - 'vertical'   : 時刻 → ドット → テキスト、縦線で連結 (default)
//   - 'cards'      : 2 列カードグリッド
//   - 'horizontal' : 横スクロールのカード列
//   - 'numbered'   : 大きい連番、線なし
//   - 'bubble'     : チャット風バブル (交互配置)

export default function TimelineDisplay({ entries, mode = 'vertical', accentColor = '#00ff87' }) {
  if (!Array.isArray(entries) || entries.length === 0) return null

  const sorted = [...entries]
    .filter(e => e && e.time && e.text)
    .sort((a, b) => String(a.time).localeCompare(String(b.time)))

  if (sorted.length === 0) return null

  if (mode === 'cards')      return <TLCards     sorted={sorted} accentColor={accentColor} />
  if (mode === 'horizontal') return <TLHorizontal sorted={sorted} accentColor={accentColor} />
  if (mode === 'numbered')   return <TLNumbered  sorted={sorted} accentColor={accentColor} />
  if (mode === 'bubble')     return <TLBubble    sorted={sorted} accentColor={accentColor} />
  return <TLVertical sorted={sorted} accentColor={accentColor} />
}

// 1. vertical: 縦線 + ドット (現状)
function TLVertical({ sorted, accentColor }) {
  return (
    <ol style={listResetStyle}>
      {sorted.map((entry, idx) => {
        const isLast = idx === sorted.length - 1
        return (
          <li key={idx} style={{ display: 'flex', gap: 14, position: 'relative', paddingBottom: isLast ? 0 : 18 }}>
            <div style={{ flex: '0 0 52px', ...timeStyle, paddingTop: 1, textAlign: 'right' }}>{entry.time}</div>
            <div style={{ flex: '0 0 12px', position: 'relative', alignSelf: 'stretch' }}>
              <span style={dotStyle(accentColor)} />
              {!isLast && <span style={lineStyle} />}
            </div>
            <div style={{ flex: 1, minWidth: 0, ...textStyle }}>{entry.text}</div>
          </li>
        )
      })}
    </ol>
  )
}

// 2. cards: 2 列カードグリッド
function TLCards({ sorted, accentColor }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
      gap: 8,
    }}>
      {sorted.map((entry, idx) => (
        <div key={idx} style={{
          padding: '10px 12px',
          border: '1px solid rgba(255,255,255,0.1)',
          borderLeft: `2px solid ${accentColor}`,
          backgroundColor: 'rgba(255,255,255,0.02)',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div style={{ ...timeStyle, fontSize: 11, color: accentColor }}>{entry.time}</div>
          <div style={{ ...textStyle, fontSize: 12 }}>{entry.text}</div>
        </div>
      ))}
    </div>
  )
}

// 3. horizontal: 横スクロール
function TLHorizontal({ sorted, accentColor }) {
  return (
    <div style={{
      display: 'flex',
      gap: 10,
      overflowX: 'auto',
      paddingBottom: 10,
      marginInline: -4,
      paddingInline: 4,
      scrollbarWidth: 'thin',
    }}>
      {sorted.map((entry, idx) => (
        <div key={idx} style={{
          flex: '0 0 160px',
          padding: '12px 14px',
          border: '1px solid rgba(255,255,255,0.1)',
          borderTop: `2px solid ${accentColor}`,
          backgroundColor: 'rgba(255,255,255,0.02)',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ ...timeStyle, fontSize: 11, color: accentColor }}>{entry.time}</div>
          <div style={{ ...textStyle, fontSize: 12, lineHeight: 1.45 }}>{entry.text}</div>
        </div>
      ))}
    </div>
  )
}

// 4. numbered: 大きい連番、線なし
function TLNumbered({ sorted, accentColor }) {
  return (
    <ol style={listResetStyle}>
      {sorted.map((entry, idx) => (
        <li key={idx} style={{
          display: 'flex', gap: 16, alignItems: 'flex-start',
          paddingBlock: 12,
          borderBottom: idx < sorted.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
        }}>
          <div style={{
            flex: '0 0 36px',
            fontSize: 22, fontWeight: 900,
            color: accentColor,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}>{String(idx + 1).padStart(2, '0')}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...timeStyle, fontSize: 10, marginBottom: 4, textAlign: 'left' }}>{entry.time}</div>
            <div style={{ ...textStyle, fontSize: 13 }}>{entry.text}</div>
          </div>
        </li>
      ))}
    </ol>
  )
}

// 5. bubble: チャット風バブル (左右交互)
function TLBubble({ sorted, accentColor }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sorted.map((entry, idx) => {
        const isRight = idx % 2 === 1
        return (
          <div key={idx} style={{
            display: 'flex',
            justifyContent: isRight ? 'flex-end' : 'flex-start',
            gap: 6, alignItems: 'flex-end',
          }}>
            {!isRight && <span style={{ ...timeStyle, fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>{entry.time}</span>}
            <div style={{
              maxWidth: '78%',
              padding: '8px 12px',
              borderRadius: 12,
              borderBottomLeftRadius: isRight ? 12 : 2,
              borderBottomRightRadius: isRight ? 2 : 12,
              backgroundColor: isRight ? `${accentColor}1f` : 'rgba(255,255,255,0.06)',
              border: isRight ? `1px solid ${accentColor}55` : '1px solid rgba(255,255,255,0.08)',
              color: '#fff', fontSize: 12.5, lineHeight: 1.5,
              wordBreak: 'break-word',
            }}>{entry.text}</div>
            {isRight && <span style={{ ...timeStyle, fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>{entry.time}</span>}
          </div>
        )
      })}
    </div>
  )
}

// 共通スタイル
const listResetStyle = { listStyle: 'none', margin: 0, padding: 0, position: 'relative' }
const timeStyle = {
  fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
  color: 'rgba(255,255,255,0.85)',
  fontVariantNumeric: 'tabular-nums',
}
const textStyle = {
  fontSize: 13, lineHeight: 1.5, color: '#fff', wordBreak: 'break-word',
}
const dotStyle = accentColor => ({
  position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)',
  width: 9, height: 9, borderRadius: '50%',
  backgroundColor: accentColor,
  boxShadow: `0 0 0 3px rgba(0,0,0,0.85), 0 0 0 4px ${accentColor}33`,
  zIndex: 1,
})
const lineStyle = {
  position: 'absolute', top: 12, bottom: -6, left: '50%', transform: 'translateX(-50%)',
  width: 1, backgroundColor: 'rgba(255,255,255,0.12)',
}
