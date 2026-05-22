// ヘッダーデザイン比較ページ (round 2)
//   - 採用候補は「E (Tab Underline)」をベースに 5 バリエーション展開
//   - ロゴは画像ではなく「J Leak Stats」テキスト
//   - URL: /header-preview

export const metadata = { title: 'ヘッダーデザイン候補 r2 | preview' }

const NAV_ITEMS = [
  { href: '/search',  label: '試合検索' },
  { href: '/rating',  label: '採点' },
  { href: '/notes',   label: '観戦ノート' },
  { href: '/fantype', label: 'FANTYPE' },
]

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

// 小さいユニフォーム形アイコン
function MiniJersey({ color, jerseyNumber, avatarLetters, size = 46 }) {
  const txtColor = textOn(color)
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
        color: txtColor, pointerEvents: 'none',
      }}>
        <div style={{ fontSize: 11 * (size/46), fontWeight: 900, lineHeight: 1, paddingTop: 8 * (size/46) }}>{jerseyNumber}</div>
        <div style={{ fontSize: 5 * (size/46), fontWeight: 800, marginTop: 1 }}>{avatarLetters}</div>
      </div>
    </div>
  )
}

export default function HeaderPreviewPage() {
  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', color: '#fff' }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>
        ヘッダーデザイン候補 — Tab Underline ベース 5 パターン
      </h1>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 28 }}>
        ロゴは「J Leak Stats」テキスト、ナビはタブ風 (現在ページ = 採点 をハイライト)。
        気に入った id を伝えてください。
      </p>

      <Variant id="E1" name="Clean Underline" desc="細い緑下線、ミニマル">
        <PatternE1 />
      </Variant>

      <Variant id="E2" name="Anta Bold Logo + Thick Underline" desc="ロゴを Anta フォントで目立たせる + 太い緑下線">
        <PatternE2 />
      </Variant>

      <Variant id="E3" name="Brand Color Tab" desc="現在ページのタブが推しクラブカラーの下線・文字色">
        <PatternE3 />
      </Variant>

      <Variant id="E4" name="Pill Active" desc="現在ページが緑ピル (背景塗りつぶし)">
        <PatternE4 />
      </Variant>

      <Variant id="E5" name="Italic Sport" desc="ロゴをイタリック、ナビは大文字英字でスポーティ">
        <PatternE5 />
      </Variant>

      <p style={{ marginTop: 32, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
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
        <span style={{ fontSize: 18, fontWeight: 900, color: '#00ff87', width: 30, textAlign: 'center' }}>{id}</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{name}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{desc}</div>
        </div>
      </div>
      {children}
    </section>
  )
}

// ── E1: Clean Underline ──────────────────────────────────────
function PatternE1() {
  return (
    <div style={{
      backgroundColor: '#0a0a0a',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      padding: '0 16px',
      display: 'flex', alignItems: 'stretch', gap: 16,
      minHeight: 56,
    }}>
      <span style={{
        display: 'flex', alignItems: 'center',
        fontSize: 15, fontWeight: 900, letterSpacing: '0.04em',
        color: '#fff', whiteSpace: 'nowrap', flexShrink: 0,
      }}>J Leak Stats</span>
      <nav style={{ flex: 1, display: 'flex', alignItems: 'stretch' }}>
        {NAV_ITEMS.map((item, i) => {
          const active = i === 1
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

// ── E2: Anta Bold Logo + Thick Underline ──────────────────────
function PatternE2() {
  return (
    <div style={{
      backgroundColor: '#0a0a0a',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      padding: '0 18px',
      display: 'flex', alignItems: 'stretch', gap: 22,
      minHeight: 64,
    }}>
      <span style={{
        display: 'flex', alignItems: 'center',
        fontFamily: 'Anta, sans-serif',
        fontSize: 20, fontWeight: 900, letterSpacing: '0.06em',
        color: '#fff', textTransform: 'uppercase',
        whiteSpace: 'nowrap', flexShrink: 0,
      }}>J Leak Stats</span>
      <nav style={{ flex: 1, display: 'flex', alignItems: 'stretch' }}>
        {NAV_ITEMS.map((item, i) => {
          const active = i === 1
          return (
            <span key={item.href} style={{
              fontSize: 13, fontWeight: 800, letterSpacing: '0.08em',
              padding: '0 20px',
              color: active ? '#00ff87' : 'rgba(255,255,255,0.55)',
              borderBottom: active ? '4px solid #00ff87' : '4px solid transparent',
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

// ── E3: Brand Color Tab (推しクラブカラー) ────────────────────
function PatternE3() {
  const brand = SAMPLE_PROFILE.club_color
  return (
    <div style={{
      backgroundColor: '#0a0a0a',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      padding: '0 16px',
      display: 'flex', alignItems: 'stretch', gap: 16,
      minHeight: 56,
    }}>
      <span style={{
        display: 'flex', alignItems: 'center',
        fontSize: 15, fontWeight: 900, letterSpacing: '0.04em',
        color: '#fff', whiteSpace: 'nowrap', flexShrink: 0,
      }}>J Leak Stats</span>
      <nav style={{ flex: 1, display: 'flex', alignItems: 'stretch' }}>
        {NAV_ITEMS.map((item, i) => {
          const active = i === 1
          return (
            <span key={item.href} style={{
              fontSize: 12, fontWeight: 800, letterSpacing: '0.06em',
              padding: '0 18px',
              color: active ? brand : 'rgba(255,255,255,0.55)',
              borderBottom: active ? `3px solid ${brand}` : '3px solid transparent',
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

// ── E4: Pill Active ──────────────────────────────────────────
function PatternE4() {
  return (
    <div style={{
      backgroundColor: '#0a0a0a',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      padding: '12px 16px',
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <span style={{
        fontSize: 15, fontWeight: 900, letterSpacing: '0.04em',
        color: '#fff', whiteSpace: 'nowrap', flexShrink: 0,
      }}>J Leak Stats</span>
      <nav style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
        {NAV_ITEMS.map((item, i) => {
          const active = i === 1
          return (
            <span key={item.href} style={{
              fontSize: 12, fontWeight: 800, letterSpacing: '0.06em',
              padding: '7px 14px',
              borderRadius: 999,
              color: active ? '#000' : 'rgba(255,255,255,0.7)',
              backgroundColor: active ? '#00ff87' : 'transparent',
            }}>{item.label}</span>
          )
        })}
      </nav>
      <MiniJersey color={SAMPLE_PROFILE.club_color} jerseyNumber={SAMPLE_PROFILE.jersey_number} avatarLetters={SAMPLE_PROFILE.avatar_text} />
    </div>
  )
}

// ── E5: Italic Sport ─────────────────────────────────────────
function PatternE5() {
  return (
    <div style={{
      backgroundColor: '#0a0a0a',
      borderBottom: '2px solid rgba(255,255,255,0.06)',
      padding: '0 16px',
      display: 'flex', alignItems: 'stretch', gap: 18,
      minHeight: 60,
    }}>
      <span style={{
        display: 'flex', alignItems: 'center',
        fontFamily: 'Anta, sans-serif',
        fontSize: 22, fontWeight: 900, letterSpacing: '0.02em',
        color: '#fff', fontStyle: 'italic',
        whiteSpace: 'nowrap', flexShrink: 0,
      }}>J Leak Stats</span>
      <nav style={{ flex: 1, display: 'flex', alignItems: 'stretch' }}>
        {NAV_ITEMS.map((item, i) => {
          const active = i === 1
          return (
            <span key={item.href} style={{
              fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
              padding: '0 16px',
              color: active ? '#00ff87' : 'rgba(255,255,255,0.45)',
              borderBottom: active ? '2px solid #00ff87' : '2px solid transparent',
              display: 'flex', alignItems: 'center',
              textTransform: 'uppercase',
              fontStyle: 'italic',
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
