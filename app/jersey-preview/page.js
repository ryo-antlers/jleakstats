// 一時的なユニフォーム形デザイン比較ページ
//   - 6 種類の SVG path を並べて比較
//   - ユーザーが選んだら ProfileHeader.js に反映し、このページは削除予定
//   - URL: /jersey-preview

export const metadata = { title: 'ユニフォーム形デザイン候補 | preview' }

const VARIANTS = [
  {
    id: 'A',
    name: '狭いクルーネック (現在のデフォルト)',
    desc: '中央に小さな U 字凹み、上辺は基本水平',
    path: 'M 28 8 L 42 8 Q 50 16, 58 8 L 72 8 L 92 14 L 86 30 L 76 26 L 76 66 L 24 66 L 24 26 L 14 30 L 8 14 Z',
  },
  {
    id: 'B',
    name: '狭い V 字',
    desc: '中央に鋭い V カットの首元',
    path: 'M 28 8 L 44 8 L 50 16 L 56 8 L 72 8 L 92 14 L 86 30 L 76 26 L 76 66 L 24 66 L 24 26 L 14 30 L 8 14 Z',
  },
  {
    id: 'C',
    name: 'ポロシャツ風 (襟あり)',
    desc: '小さな襟がついた首元',
    path: 'M 28 8 L 38 8 L 38 14 L 50 18 L 62 14 L 62 8 L 72 8 L 92 14 L 86 30 L 76 26 L 76 66 L 24 66 L 24 26 L 14 30 L 8 14 Z',
  },
  {
    id: 'D',
    name: '広いクルーネック (前バージョン)',
    desc: '首元が広く開いた丸首',
    path: 'M 30 6 Q 50 22, 70 6 L 92 14 L 86 30 L 76 26 L 76 66 L 24 66 L 24 26 L 14 30 L 8 14 Z',
  },
  {
    id: 'E',
    name: 'T シャツ風 (凹みなし)',
    desc: '首の凹みなし、ストレートな上辺',
    path: 'M 28 8 L 72 8 L 92 14 L 86 30 L 76 26 L 76 66 L 24 66 L 24 26 L 14 30 L 8 14 Z',
  },
  {
    id: 'F',
    name: '袖長め・首小さめ',
    desc: '袖の張り出しが大きく、首元は小さなクルーネック',
    path: 'M 28 8 L 42 8 Q 50 16, 58 8 L 72 8 L 96 12 L 90 36 L 76 30 L 76 66 L 24 66 L 24 30 L 10 36 L 4 12 Z',
  },
  {
    id: 'G',
    name: '丸シルエット・全体ふんわり',
    desc: '角を全部丸めて、シルエット全体がコロッと丸い',
    path: 'M 36 10 Q 50 14, 64 10 Q 80 10, 90 16 Q 94 24, 86 30 Q 80 30, 76 28 L 76 58 Q 76 66, 68 67 Q 50 70, 32 67 Q 24 66, 24 58 L 24 28 Q 20 30, 14 30 Q 6 24, 10 16 Q 20 10, 36 10 Z',
  },
  {
    id: 'H',
    name: '絵文字シャツ風 (👕) — 元バージョン',
    desc: 'iOS 絵文字に近い、肩が丸く全体的にポップ',
    path: 'M 32 12 Q 50 16, 68 12 L 86 16 Q 92 18, 90 26 Q 86 32, 78 30 Q 78 56, 76 62 Q 72 66, 64 66 L 36 66 Q 28 66, 24 62 Q 22 56, 22 30 Q 14 32, 10 26 Q 8 18, 14 16 Z',
  },
  {
    id: 'H2',
    name: '絵文字シャツ風 (👕) — 調整版【採用中】',
    desc: '横幅を控えめにして、袖をやや太く + さらに横幅を縮める',
    path: 'M 38 12 Q 50 16, 62 12 L 78 16 Q 84 18, 82 28 Q 78 34, 70 32 Q 70 56, 68 62 Q 64 66, 58 66 L 42 66 Q 36 66, 32 62 Q 30 56, 30 32 Q 22 34, 18 28 Q 16 18, 22 16 Z',
  },
  {
    id: 'I',
    name: 'マシュマロ系 (袖の境界なし)',
    desc: '袖と本体の境界をなくしてふっくら一体感',
    path: 'M 38 10 Q 50 13, 62 10 Q 78 8, 88 18 Q 92 28, 84 30 L 80 28 L 80 60 Q 80 66, 72 67 Q 50 70, 28 67 Q 20 66, 20 60 L 20 28 L 16 30 Q 8 28, 12 18 Q 22 8, 38 10 Z',
  },
]

// 表示用のテストデータ
const SAMPLES = [
  { label: 'マリノス太郎', color: '#0046ad', textColor: '#fff', number: 6, letters: 'マリ' },
  { label: 'ゼルビア花子', color: '#0d2d6b', textColor: '#fff', number: 7, letters: 'ゼル' },
  { label: '広島サポ',     color: '#7f1416', textColor: '#fff', number: 11, letters: 'サン' },
  { label: '名前2文字なし', color: '#0046ad', textColor: '#fff', number: 10, letters: 'A' },
  { label: '背番号なし',   color: '#7f1416', textColor: '#fff', number: null, letters: 'NS' },
]

export default function JerseyPreviewPage() {
  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', color: '#fff' }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>
        ユニフォーム形デザイン候補
      </h1>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 24 }}>
        各案を 5 サンプルで表示。気に入った id (A〜F) を伝えてください。
        反映したい微調整 (背番号の位置、名前のフォントサイズ等) もあわせて。
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {VARIANTS.map(v => (
          <section key={v.id} style={{
            padding: 16,
            border: '1px solid rgba(255,255,255,0.1)',
            backgroundColor: '#161616',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
              <span style={{
                fontSize: 18, fontWeight: 900, color: '#00ff87',
                width: 22, textAlign: 'center',
              }}>{v.id}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{v.name}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{v.desc}</div>
              </div>
            </div>
            <div style={{
              display: 'flex', gap: 24, flexWrap: 'wrap',
              padding: '12px 4px',
            }}>
              {SAMPLES.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                }}>
                  <Jersey path={v.path} color={s.color} textColor={s.textColor} number={s.number} letters={s.letters} />
                  <div style={{
                    fontSize: 10, color: 'rgba(255,255,255,0.5)',
                    whiteSpace: 'nowrap',
                  }}>{s.label}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p style={{
        marginTop: 32, fontSize: 11, color: 'rgba(255,255,255,0.4)',
      }}>
        このページは一時的な比較用です。決まった案を反映後、削除予定。
      </p>
    </div>
  )
}

function Jersey({ path, color, textColor, number, letters }) {
  const hasNumber = number != null
  return (
    <div style={{ position: 'relative', width: 100, height: 70, flexShrink: 0 }}>
      <svg viewBox="0 0 100 70" width="100" height="70" style={{ display: 'block' }}>
        <path d={path} fill={color} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        color: textColor, pointerEvents: 'none',
        paddingTop: 20,
      }}>
        {hasNumber && (
          <div style={{
            fontSize: 22, fontWeight: 900, lineHeight: 1,
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
          }}>{number}</div>
        )}
        <div style={{
          fontSize: 10,
          fontWeight: 800,
          marginTop: hasNumber ? 1 : 0,
          letterSpacing: '0.02em',
        }}>{letters}</div>
      </div>
    </div>
  )
}
