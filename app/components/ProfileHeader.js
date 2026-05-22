import Link from 'next/link'

// プロフィールヘッダー (/u/[id] と /rating で共通)
//   - 左: ユニフォーム形アイコン (絵文字シャツ風、背番号 上 + アバター文字 下)
//   - 中央: display_name + @handle + バッジ群 (クラブ・FANTYPE)
//          + 初観戦試合行 (設定済の場合)
//          + 観戦総移動距離行 (距離 > 0 の場合)
//   - 右端: 編集ボタン (任意)
//
// props:
//   profile: { display_name, handle, jersey_number, club_name_ja, club_color,
//              fantype_type_code,
//              first_match_date, first_match_opp_short, first_match_is_home, first_match_venue_ja }
//   avatarLetters: 文字 (1〜2 字) — アイコン下部に表示
//   fantypeMeta: TYPE_META[code] か null
//   fantypeHref: FANTYPE 結果ページへの URL か null
//   seasonDistanceKm: 今季の現地観戦距離 (0 なら非表示)
//   editHref: 「プロフィール編集」ボタンの遷移先 (null なら非表示)
export default function ProfileHeader({
  profile,
  avatarLetters,
  clubColor,
  clubText,
  fantypeMeta,
  fantypeHref,
  seasonDistanceKm = 0,
  editHref = null,
}) {
  const hasFirstMatch = !!profile.first_match_date
  const hasDistance = seasonDistanceKm > 0

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '16px 0',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      marginBottom: 24,
    }}>
      {/* 左端: ユニフォーム形アイコン */}
      <JerseyAvatar
        color={clubColor}
        textColor={clubText}
        jerseyNumber={profile.jersey_number}
        avatarLetters={avatarLetters}
      />

      {/* 中央: 名前 + handle + バッジ群 + 初観戦試合行 + 観戦総移動距離行 */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: '0.04em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          lineHeight: 1.2,
        }}>
          {profile.display_name ?? '名無し'}
        </div>
        {profile.handle && (
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.4)',
            fontFamily: 'monospace', marginTop: 1, marginBottom: 6,
          }}>
            @{profile.handle}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {profile.club_name_ja && (
            <span style={{
              fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
              padding: '4px 10px', borderRadius: 999,
              color: clubText, backgroundColor: clubColor,
            }}>{profile.club_name_ja}</span>
          )}
          {fantypeMeta && (
            <Link href={fantypeHref} style={{
              fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
              padding: '4px 10px', borderRadius: 999,
              color: '#000', backgroundColor: 'var(--accent)',
              textDecoration: 'none',
            }}>{profile.fantype_type_code} {fantypeMeta.nickname}</Link>
          )}
        </div>
        {hasFirstMatch && (
          <div style={subLineStyle}>
            初観戦: {formatFirstMatch(profile)}
          </div>
        )}
        {hasDistance && (
          <div style={subLineStyle}>
            2026年 観戦総移動距離: {seasonDistanceKm.toLocaleString()} km
          </div>
        )}
      </div>

      {editHref && (
        <Link href={editHref} style={{
          fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
          padding: '7px 14px',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.2)',
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}>プロフィール編集</Link>
      )}
    </div>
  )
}

// 初観戦試合: "2009年8月8日 vs 鹿島 (H) 日産スタジアム"
function formatFirstMatch(profile) {
  const d = new Date(profile.first_match_date)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  const opp = profile.first_match_opp_short || profile.first_match_opp_name_ja || '-'
  const ha = profile.first_match_is_home ? 'H' : 'A'
  const venue = profile.first_match_venue_ja
  return `${y}年${m}月${day}日 vs ${opp} (${ha})${venue ? ` ${venue}` : ''}`
}

// ユニフォーム形アイコン: 絵文字シャツ風 (👕)
//   - 全体的に丸み・ポップ感
//   - 横幅控えめ・袖太め・裾はほぼストレート (緩い角丸)
//   - 中央に背番号 (上、大) + アバター文字 (下、小) を縦並びで重ねる
function JerseyAvatar({ color, textColor, jerseyNumber, avatarLetters }) {
  const hasNumber = jerseyNumber != null
  return (
    <div style={{ position: 'relative', width: 100, height: 72, flexShrink: 0 }}>
      <svg viewBox="0 0 100 70" width="100" height="72" style={{ display: 'block' }}>
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
        {hasNumber && (
          <div style={{
            fontSize: 24, fontWeight: 900, lineHeight: 1,
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
            paddingTop: 14,
          }}>{jerseyNumber}</div>
        )}
        <div style={{
          fontSize: 8,
          fontWeight: 800,
          marginTop: 2,
          letterSpacing: '0.02em',
        }}>{avatarLetters}</div>
      </div>
    </div>
  )
}

const subLineStyle = {
  fontSize: 11, fontWeight: 600,
  color: 'rgba(255,255,255,0.6)',
  marginTop: 6, lineHeight: 1.4,
  letterSpacing: '0.02em',
  overflowWrap: 'anywhere',
}
