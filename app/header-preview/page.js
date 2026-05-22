// 一時的なヘッダーデザイン比較ページ
//   - 5 パターンを並べて見比べる
//   - URL: /header-preview
//   - 採用後にこのページは削除予定
import Link from 'next/link'

export const metadata = { title: 'ヘッダーデザイン候補 | preview' }

const NAV_ITEMS = [
  { href: '/search',  label: '試合検索' },
  { href: '/rating',  label: '採点' },
  { href: '/notes',   label: '観戦ノート' },
  { href: '/fantype', label: 'FANTYPE' },
]

// テスト用プロフィール (ログイン済想定)
const SAMPLE_PROFILE = {
  display_name: 'マリノス太郎',
  avatar_text: 'マリ',
  handle: 'marinos_taro',
  jersey_number: 6,
  club_color: '#0046ad',
}

function textOn(hex) {
  const h = (hex ?? '').replace('#', '')
  if (h.length < 6) return '#fff'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? '#fff' : '#000'
}

// 小さいユニフォーム形アイコン (どのパターンでも使う)
function MiniJersey({ color, jerseyNumber, avatarLetters, size = 46 }) {
  const textColor = textOn(color)
  const height = (size / 46) * 32
  return (
    <div style={{ position: 'relative', width: size, height, flexShrink: 0 }}>
      <svg viewBox="0 0 100 70" width={size} height={height} style={{ display: 'block' }}>
        <path
          d="M 38 12 Q 50 16, 62 12 L 78 16 Q 84 18, 82 28 Q 78 34, 70 32 L 70 64 Q 70 66, 68 66 L 32 66 Q 30 66, 30 64 L 30 32 Q 22 34, 18 28 Q 16 18, 22 16 Z"
          fill={color}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        color: textColor, pointerEvents: 'none',
      }}>
        <div style={{
          fontSize: 11 * (size/46), fontWeight: 900, lineHeight: 1,
          paddingTop: 8 * (size/46),
        }}>{jerseyNumber}</div>
        <div style={{
          fontSize: 5 * (size/46), fontWeight: 800, marginTop: 1,
        }}>{avatarLetters}</div>
      </div>
    </div>
  )
}

export default function HeaderPreviewPage() {
  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', color: '#fff' }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>
        ヘッダーデザイン候補
      </h1>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 28 }}>
        5 パターンを並べました。気に入った id (A〜E) を伝えてください。
        微調整したい部分 (フォントサイズ・色・余白等) もあわせて。
      </p>

      <Variant id="A" name="Minimal (現状)" desc="シンプルなライン、ロゴ小・ナビ普通">
        <PatternA />
      </Variant>

      <Variant id="B" name="Sports Magazine" desc="ロゴテキスト + スラッシュ区切りナビ + 太い緑アクセントライン">
        <PatternB />
      </Variant>

      <Variant id="C" name="Two-row Centered" desc="ロゴ中央 + ナビ下段、Avatar 右上に absolute">
        <PatternC />
      </Variant>

      <Variant id="D" name="Side Accent" desc="左端に緑の縦バー、ロゴテキスト + ナビ横並び">
        <PatternD />
      </Variant>

      <Variant id="E" name="Tab Underline" desc="ナビをタブ風に下線、現在ページがアクセント色">
        <PatternE />
      </Variant>

      <p style={{
        marginTop: 32, fontSize: 11, color: 'rgba(255,255,255,0.4)',
      }}>
        このページは一時的な比較用。決まった案を反映後、削除予定。
      </p>
    </div>
  )
}

function Variant({ id, name, desc, children }) {
  return (
    <section style={{
      marginBottom: 28,
      border: '1px solid rgba(255,255,255,0.1)',
      backgroundColor: '#0f0f0f',
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 12,
        padding: '14px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{
          fontSize: 18, fontWeight: 900, color: '#00ff87',
          width: 22, textAlign: 'center',
        }}>{id}</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{name}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{desc}</div>
        </div>
      </div>
      <div style={{ padding: 0 }}>
        {children}
      </div>
    </section>
  )
}

// ── A: Minimal (現状そのまま) ────────────────────────────────
function PatternA() {
  return (
    <div style={{
      backgroundColor: 'rgba(17,17,17,0.92)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/apple-icon.png" alt="" width={32} height={32} style={{ borderRadius: 6 }} />
      <nav style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 8 }}>
        {NAV_ITEMS.map(item => (
          <span key={item.href} style={{
            fontSize: 12, fontWeight: 800, letterSpacing: '0.06em',
            padding: '6px 12px', color: 'rgba(255,255,255,0.85)',
          }}>{item.label}</span>
        ))}
      </nav>
      <MiniJersey color={SAMPLE_PROFILE.club_color} jerseyNumber={SAMPLE_PROFILE.jersey_number} avatarLetters={SAMPLE_PROFILE.avatar_text} />
    </div>
  )
}

// ── B: Sports Magazine (太いアクセント + スラッシュ区切り) ─────────
function PatternB() {
  return (
    <div style={{
      backgroundColor: '#0a0a0a',
      borderBottom: '3px solid #00ff87',
      padding: '14px 18px',
      display: 'flex', alignItems: 'center', gap: 18,
    }}>
      <span style={{
        fontFamily: 'Anta, sans-serif',
        fontSize: 22, fontWeight: 900, color: '#fff',
        letterSpacing: '0.04em',
      }}>J.LEAK STATS</span>
      <nav style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0, color: 'rgba(255,255,255,0.7)' }}>
        {NAV_ITEMS.map((item, i) => (
          <span key={item.href} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && <span style={{ color: 'rgba(255,255,255,0.3)', margin: '0 14px', fontSize: 14 }}>/</span>}
            <span style={{
              fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}>{item.label}</span>
          </span>
        ))}
      </nav>
      <MiniJersey color={SAMPLE_PROFILE.club_color} jerseyNumber={SAMPLE_PROFILE.jersey_number} avatarLetters={SAMPLE_PROFILE.avatar_text} />
    </div>
  )
}

// ── C: Two-row Centered (ロゴ中央 + ナビ下段 + Avatar 右上 absolute) ─
function PatternC() {
  return (
    <div style={{
      position: 'relative',
      backgroundColor: '#0a0a0a',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      padding: '18px 16px 0',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/apple-icon.png" alt="" width={40} height={40} style={{ borderRadius: 8, display: 'inline-block' }} />
      </div>
      <nav style={{
        display: 'flex', justifyContent: 'center', gap: 0,
        borderTop: '1px solid rgba(255,255,255,0.08)',
        paddingTop: 0,
      }}>
        {NAV_ITEMS.map(item => (
          <span key={item.href} style={{
            fontSize: 12, fontWeight: 800, letterSpacing: '0.12em',
            padding: '14px 20px',
            color: 'rgba(255,255,255,0.85)',
            textTransform: 'uppercase',
          }}>{item.label}</span>
        ))}
      </nav>
      <div style={{ position: 'absolute', top: 14, right: 16 }}>
        <MiniJersey color={SAMPLE_PROFILE.club_color} jerseyNumber={SAMPLE_PROFILE.jersey_number} avatarLetters={SAMPLE_PROFILE.avatar_text} />
      </div>
    </div>
  )
}

// ── D: Side Accent (左端に緑の縦バー、左寄せ) ───────────────────
function PatternD() {
  return (
    <div style={{
      backgroundColor: '#0a0a0a',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      padding: '12px 18px',
      display: 'flex', alignItems: 'center', gap: 16,
      position: 'relative',
    }}>
      <span style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: 4, backgroundColor: '#00ff87',
      }} />
      <span style={{
        fontFamily: 'Anta, sans-serif',
        fontSize: 18, fontWeight: 900, color: '#fff',
        letterSpacing: '0.06em',
      }}>J.LEAK STATS</span>
      <nav style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
        {NAV_ITEMS.map(item => (
          <span key={item.href} style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
            padding: '6px 12px',
            color: 'rgba(255,255,255,0.7)',
            textTransform: 'uppercase',
          }}>{item.label}</span>
        ))}
      </nav>
      <MiniJersey color={SAMPLE_PROFILE.club_color} jerseyNumber={SAMPLE_PROFILE.jersey_number} avatarLetters={SAMPLE_PROFILE.avatar_text} />
    </div>
  )
}

// ── E: Tab Underline (ナビをタブ風、現在ページにアクセント下線) ─────
function PatternE() {
  return (
    <div style={{
      backgroundColor: '#0a0a0a',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      padding: '0 16px',
      display: 'flex', alignItems: 'stretch', gap: 14,
      minHeight: 56,
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/apple-icon.png" alt="" width={28} height={28}
        style={{ borderRadius: 6, alignSelf: 'center', flexShrink: 0 }} />
      <nav style={{
        flex: 1, display: 'flex', alignItems: 'stretch', gap: 0,
      }}>
        {NAV_ITEMS.map((item, i) => {
          const active = i === 1 // 「採点」を仮アクティブ
          return (
            <span key={item.href} style={{
              fontSize: 12, fontWeight: 800, letterSpacing: '0.06em',
              padding: '0 18px',
              color: active ? '#00ff87' : 'rgba(255,255,255,0.55)',
              borderBottom: active ? '2px solid #00ff87' : '2px solid transparent',
              display: 'flex', alignItems: 'center',
            }}>{item.label}</span>
          )
        })}
      </nav>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <MiniJersey color={SAMPLE_PROFILE.club_color} jerseyNumber={SAMPLE_PROFILE.jersey_number} avatarLetters={SAMPLE_PROFILE.avatar_text} />
      </div>
    </div>
  )
}
