import Link from 'next/link'

// プロフィールヘッダー (/u/[id] と /rating で共通)
//   - 左: ユニフォーム形アイコン (背番号 + 名前 縦並び)
//   - 中央: display_name + @handle + バッジ群 (クラブ・FANTYPE・住所)
//   - 右端: SINCE / 2026 DISTANCE の 2 列縦並び (項目間に薄い縦線)
//   - editLink を渡せば右側に「プロフィール編集」ボタンを追加 (自分のページ用)
//
// props:
//   profile: { display_name, handle, jersey_number, club_name_ja, club_color,
//              fantype_type_code, prefecture, city, address_private, supporter_since }
//   avatarLetters: 文字 (1〜2 字) — アイコン下部に表示
//   fantypeMeta: TYPE_META[code] か null
//   fantypeHref: FANTYPE 結果ページへの URL か null
//   seasonDistanceKm: 今季の現地観戦距離 (0 なら非表示)
//   isOwnPage: 自分のページか (true なら住所の private を尊重しない = 自分には常に見せる)
//   editHref: 「プロフィール編集」ボタンの遷移先 (null なら非表示)
export default function ProfileHeader({
  profile,
  avatarLetters,
  clubColor,
  clubText,
  fantypeMeta,
  fantypeHref,
  seasonDistanceKm = 0,
  isOwnPage = false,
  editHref = null,
}) {
  const hasSince = profile.supporter_since != null
  const hasDistance = seasonDistanceKm > 0
  const hasStats = hasSince || hasDistance

  // 住所表示: 自分のページなら常に表示 (=自分にだけ「設定通り」確認可能)
  //           他人のページなら address_private が false の時だけ
  const showAddress = isOwnPage || !profile.address_private

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

      {/* 中央: 名前 + handle + バッジ群 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: '0.04em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {profile.display_name ?? '名無し'}
        </div>
        {profile.handle && (
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
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
          {showAddress && profile.prefecture && (
            <span style={addressBadgeStyle}>
              {profile.prefecture}{profile.city ? ` ${profile.city}` : ''}
            </span>
          )}
        </div>
      </div>

      {/* 右端: SINCE / 2026 DISTANCE の 2 列縦並び (項目間に薄い縦線) */}
      {hasStats && (
        <div style={{
          display: 'flex', alignItems: 'stretch',
          flexShrink: 0,
        }}>
          {hasSince && (
            <StatColumn label="SINCE" value={`'${String(profile.supporter_since).slice(-2)}`} />
          )}
          {hasSince && hasDistance && <StatDivider />}
          {hasDistance && (
            <StatColumn label="2026 DISTANCE" value={`${seasonDistanceKm.toLocaleString()} km`} />
          )}
        </div>
      )}

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

// 統計カラム (SINCE / 2026 DISTANCE) — ラベル小 + 値大の縦並び
function StatColumn({ label, value }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '4px 14px',
      minWidth: 70,
    }}>
      <div style={{
        fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
        color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase',
        marginBottom: 4,
      }}>{label}</div>
      <div style={{
        fontSize: 18, fontWeight: 900, color: '#fff',
        letterSpacing: '0.02em',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}>{value}</div>
    </div>
  )
}

function StatDivider() {
  return (
    <div style={{
      width: 1, alignSelf: 'stretch',
      backgroundColor: 'rgba(255,255,255,0.12)',
    }} />
  )
}

// ユニフォーム形アイコン: 「首だけ凹む」型サッカーシャツのシルエット
//   - 凹みは中央の小さなクルーネック (狭い U 字)
//   - 中央に背番号 (上、大) + 名前 (下、小) を縦並びで重ねる
//   - 横長の比率 (100x70) でコンパクト
//   - 背番号は中央やや下に配置、名前は背番号のすぐ下に小さく
function JerseyAvatar({ color, textColor, jerseyNumber, avatarLetters }) {
  const hasNumber = jerseyNumber != null
  return (
    <div style={{ position: 'relative', width: 76, height: 54, flexShrink: 0 }}>
      <svg viewBox="0 0 100 70" width="76" height="54" style={{ display: 'block' }}>
        {/*
          首だけクルーネック: 上辺は基本水平、中央 (x=42-58) に小さな U 字凹みのみ
            肩 → 上辺 → 首凹み (Q ベジェ) → 上辺 → 肩 → 袖 → 脇 → 裾 …
        */}
        <path
          d="M 28 8 L 42 8 Q 50 16, 58 8 L 72 8 L 92 14 L 86 30 L 76 26 L 76 66 L 24 66 L 24 26 L 14 30 L 8 14 Z"
          fill={color}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        color: textColor, pointerEvents: 'none',
        paddingTop: 16,
      }}>
        {hasNumber && (
          <div style={{
            fontSize: 18, fontWeight: 900, lineHeight: 1,
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
          }}>{jerseyNumber}</div>
        )}
        <div style={{
          fontSize: 8,
          fontWeight: 800,
          marginTop: hasNumber ? 1 : 0,
          letterSpacing: '0.02em',
        }}>{avatarLetters}</div>
      </div>
    </div>
  )
}

const addressBadgeStyle = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
  padding: '4px 10px', borderRadius: 999,
  color: 'rgba(255,255,255,0.75)',
  backgroundColor: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
}
