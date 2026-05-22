// 観戦タイムラインのオシャレ表示 (read-only)
//   - 縦軸: 時刻 (左) → ドット → テキスト (右)
//   - 全エントリを線で繋ぐ
//   - 入力フォームのプレビュー / 公開ページの表示の両方で使う

export default function TimelineDisplay({ entries, accentColor = '#00ff87' }) {
  if (!Array.isArray(entries) || entries.length === 0) return null

  // 時刻昇順にソート (API 側でもソート済だが防御的に)
  const sorted = [...entries]
    .filter(e => e && e.time && e.text)
    .sort((a, b) => String(a.time).localeCompare(String(b.time)))

  if (sorted.length === 0) return null

  return (
    <ol style={{
      listStyle: 'none',
      margin: 0,
      padding: 0,
      position: 'relative',
    }}>
      {sorted.map((entry, idx) => {
        const isLast = idx === sorted.length - 1
        return (
          <li key={idx} style={{ display: 'flex', gap: 14, position: 'relative', paddingBottom: isLast ? 0 : 18 }}>
            {/* 時刻 */}
            <div style={{
              flex: '0 0 52px',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: 'rgba(255,255,255,0.85)',
              fontVariantNumeric: 'tabular-nums',
              paddingTop: 1,
              textAlign: 'right',
            }}>{entry.time}</div>

            {/* ドット + 縦線 */}
            <div style={{
              flex: '0 0 12px',
              position: 'relative',
              alignSelf: 'stretch',
            }}>
              <span style={{
                position: 'absolute',
                top: 4,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 9,
                height: 9,
                borderRadius: '50%',
                backgroundColor: accentColor,
                boxShadow: `0 0 0 3px rgba(0,0,0,0.85), 0 0 0 4px ${accentColor}33`,
                zIndex: 1,
              }} />
              {!isLast && (
                <span style={{
                  position: 'absolute',
                  top: 12,
                  bottom: -6,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 1,
                  backgroundColor: 'rgba(255,255,255,0.12)',
                }} />
              )}
            </div>

            {/* テキスト */}
            <div style={{
              flex: 1,
              minWidth: 0,
              fontSize: 13,
              lineHeight: 1.5,
              color: '#fff',
              wordBreak: 'break-word',
              paddingTop: 0,
            }}>{entry.text}</div>
          </li>
        )
      })}
    </ol>
  )
}
