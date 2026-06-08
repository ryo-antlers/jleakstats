'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClerk } from '@clerk/nextjs'
import { containsNG } from '@/lib/ng-words'
import { isReservedHandle } from '@/lib/reserved-handles'

const CURRENT_YEAR = new Date().getFullYear()
const FIRST_MATCH_YEAR_MIN = 1993

const CLUB_CHANGE_COOLDOWN_DAYS = 7

function textColor(hex) {
  if (!hex || hex.length < 7) return '#fff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? '#fff' : '#000'
}

function normalizeColor(hex) {
  if (!hex) return null
  const v = String(hex).trim()
  if (!v) return null
  return v.startsWith('#') ? v : `#${v}`
}

function formatCountdown(seconds) {
  if (seconds <= 0) return null
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  if (days > 0) return `あと ${days} 日 ${hours} 時間`
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `あと ${hours} 時間 ${minutes} 分`
  return `あと ${minutes} 分`
}

const TIER_LABEL = { 1: 'J1', 2: 'J2', 3: 'J3' }

// J公式の表記順 (2026シーズン)
const TIER_ORDER = {
  1: ['鹿島', '水戸', '浦和', '千葉', '柏', 'FC東京', '東京V', '町田', '川崎F', '横浜FM',
      '清水', '名古屋', '京都', 'G大阪', 'C大阪', '神戸', '岡山', '広島', '福岡', '長崎'],
  2: ['札幌', '八戸', '仙台', '秋田', '山形', 'いわき', '栃木シティ', '大宮', '横浜FC', '湘南',
      '甲府', '新潟', '富山', '磐田', '藤枝', '徳島', '今治', '鳥栖', '大分', '宮崎'],
  3: ['福島', '栃木SC', '群馬', '相模原', '松本', '長野', '金沢', '岐阜', '滋賀', 'FC大阪',
      '奈良', '鳥取', '山口', '讃岐', '愛媛', '高知', '北九州', '熊本', '鹿児島', '琉球'],
}

// クラブを名前で検索（短縮名 → 名前完全一致 → 名前先頭一致 → 名前部分一致）
function findClubByKey(pool, key) {
  let c = pool.find(c => c.short_name === key)
  if (c) return c
  c = pool.find(c => c.name_ja === key)
  if (c) return c
  c = pool.find(c => (c.name_ja ?? '').startsWith(key))
  if (c) return c
  c = pool.find(c => (c.name_ja ?? '').includes(key))
  if (c) return c
  return null
}

export default function ProfileForm({
  clubs,
  profile,
  initialPlayers = [],
  initialFirstMatch = null,
  initialFirstMatchFixtures = [],
  next,
}) {
  const router = useRouter()
  const { signOut } = useClerk()
  const isEdit = Boolean(profile)

  async function handleSignOut() {
    if (!confirm('サインアウトしますか？')) return
    await signOut()
    router.push('/')
    router.refresh()
  }

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  // avatar_text 初期値: 保存済みがあればそれ、なければユーザー名先頭2文字をプレフィル
  const [avatarText, setAvatarText] = useState(() => {
    if (profile?.avatar_text) return profile.avatar_text
    const name = (profile?.display_name ?? '').trim()
    return [...name].slice(0, 2).join('')
  })
  const [handle, setHandle] = useState(profile?.handle ?? '')
  const [clubId, setClubId] = useState(profile?.supported_club_id ?? null)
  const [activeTier, setActiveTier] = useState(1)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // SNS 拡張フィールド
  const [favoritePlayerId, setFavoritePlayerId] = useState(profile?.favorite_player_id ?? null)
  const [jerseyNumber, setJerseyNumber] = useState(
    profile?.jersey_number != null ? String(profile.jersey_number) : '',
  )
  // 初観戦試合: 年 Select + 試合 Select の 2 段。
  // year を変えると当該クラブのその年の試合一覧を fetch、fixture_id 単独保存。
  const [firstMatchYear, setFirstMatchYear] = useState(
    initialFirstMatch?.year != null ? String(initialFirstMatch.year) : '',
  )
  const [firstMatchFixtureId, setFirstMatchFixtureId] = useState(
    initialFirstMatch?.fixture_id ?? null,
  )
  const [firstMatchFixtures, setFirstMatchFixtures] = useState(initialFirstMatchFixtures)
  const [firstMatchLoading, setFirstMatchLoading] = useState(false)

  // 推しクラブの選手リスト (クラブ変更時に再取得)
  const [players, setPlayers] = useState(initialPlayers)
  const [playersLoading, setPlayersLoading] = useState(false)

  const cooldownSeconds = useMemo(() => {
    if (!profile?.club_changed_at) return 0
    const changedAt = new Date(profile.club_changed_at).getTime()
    const unlockAt = changedAt + CLUB_CHANGE_COOLDOWN_DAYS * 86400 * 1000
    return Math.max(0, Math.floor((unlockAt - Date.now()) / 1000))
  }, [profile?.club_changed_at])

  const originalClubId = profile?.supported_club_id ?? null
  const clubLocked = isEdit && cooldownSeconds > 0
  const countdownLabel = formatCountdown(cooldownSeconds)

  // tier別にグループ化 (TIER_ORDER の順番通り、DB から該当チームを抽出)
  const tierGroups = useMemo(() => {
    const m = { 1: [], 2: [], 3: [] }
    const usedIds = new Set()
    for (const tier of [1, 2, 3]) {
      for (const key of TIER_ORDER[tier]) {
        const pool = clubs.filter(c => !usedIds.has(c.id))
        const club = findClubByKey(pool, key)
        if (club) {
          m[tier].push(club)
          usedIds.add(club.id)
        }
      }
    }
    return m
  }, [clubs])

  const selectedClub = clubs.find(c => c.id === clubId)
  const clubChangeAttempted = isEdit && clubId !== originalClubId
  const disableSubmit =
    loading ||
    !displayName.trim() ||
    !handle.trim() ||
    !clubId ||
    (clubLocked && clubChangeAttempted)

  // 選択中クラブが含まれる tier を初期表示にする
  useEffect(() => {
    if (clubId == null) return
    for (const tier of [1, 2, 3]) {
      if (tierGroups[tier].some(c => c.id === clubId)) {
        setActiveTier(tier)
        return
      }
    }
  }, [clubId, tierGroups])

  // クラブ変更時の処理:
  //   - 選手リストを再取得
  //   - 推し選手 / 背番号 を null クリア (新クラブに無効な選手 ID を残さない)
  //   - 初期表示クラブと一致する間は initialPlayers をそのまま使う
  const originalClubIdRef = profile?.supported_club_id ?? null
  useEffect(() => {
    if (clubId == null) {
      setPlayers([])
      return
    }
    if (clubId === originalClubIdRef) {
      setPlayers(initialPlayers)
      return
    }
    // クラブが初期値と違う = ユーザーが切り替えた
    setFavoritePlayerId(null)
    setJerseyNumber('')
    setFirstMatchYear('')
    setFirstMatchFixtureId(null)
    setFirstMatchFixtures([])
    setPlayersLoading(true)
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/clubs/${clubId}/players`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) setPlayers(data.players ?? [])
      } catch {
        if (!cancelled) setPlayers([])
      } finally {
        if (!cancelled) setPlayersLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [clubId, originalClubIdRef, initialPlayers])

  // 推し選手選択時: その選手の背番号を自動入力 (既に入力済みでも上書きする)
  const handleFavoritePlayerChange = (e) => {
    const val = e.target.value
    if (val === '') {
      setFavoritePlayerId(null)
      return
    }
    const id = Number(val)
    setFavoritePlayerId(id)
    const player = players.find(p => Number(p.id) === id)
    if (player?.number != null) {
      setJerseyNumber(String(player.number))
    }
  }

  // 年 Select 変更時: その年の推しクラブの試合一覧を fetch
  //   - 初期 year (initialFirstMatch.year) と一致する間は initialFirstMatchFixtures を使う
  //   - year を変えると fixture_id をリセットして fetch
  const originalFirstMatchYear = initialFirstMatch?.year != null ? String(initialFirstMatch.year) : ''
  useEffect(() => {
    if (!clubId || !firstMatchYear) {
      setFirstMatchFixtures([])
      return
    }
    if (firstMatchYear === originalFirstMatchYear && clubId === originalClubIdRef) {
      setFirstMatchFixtures(initialFirstMatchFixtures)
      return
    }
    // ユーザーが year を変えた → fixture_id リセットして fetch
    setFirstMatchFixtureId(null)
    setFirstMatchLoading(true)
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/clubs/${clubId}/fixtures?year=${firstMatchYear}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) setFirstMatchFixtures(data.fixtures ?? [])
      } catch {
        if (!cancelled) setFirstMatchFixtures([])
      } finally {
        if (!cancelled) setFirstMatchLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [clubId, firstMatchYear, originalFirstMatchYear, originalClubIdRef, initialFirstMatchFixtures])

  // アイコン文字のバリデーション (空 / 1〜2文字、言語不問、NGワード不可)
  const avatarTextError = (() => {
    const v = avatarText.trim()
    if (v === '') return null
    const chars = [...v]
    if (chars.length > 2) return '1〜2文字まで'
    if (containsNG(v)) return '使用できない言葉が含まれています'
    return null
  })()

  // URL ハンドルのバリデーション (必須 / 3〜20文字、半角英数 + _ -、予約語不可)
  //   空のときの inline エラーは出さず (入力前から赤くしない)、送信時にブロックする
  const handleError = (() => {
    const v = handle.trim()
    if (v === '') return null
    if (!/^[a-zA-Z0-9_-]+$/.test(v)) return '半角英数と _ - のみ使えます'
    if (v.length < 3 || v.length > 20) return '3〜20文字で入力してください'
    if (isReservedHandle(v)) return 'このユーザーIDは使用できません'
    return null
  })()

  // アイコン表示用の文字 (custom > display name の先頭2文字)
  const avatarDisplay = avatarText.trim() || [...displayName.trim()].slice(0, 2).join('')
  const selectedClubColor = selectedClub
    ? (normalizeColor(selectedClub.color_primary) ?? '#444')
    : '#444'

  // jersey のクライアントバリデーション
  const jerseyError = (() => {
    const v = jerseyNumber.trim()
    if (v === '') return null
    const n = Number(v)
    if (!Number.isInteger(n) || n < 1 || n > 99) return '1〜99の数字'
    return null
  })()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    const trimmed = displayName.trim()
    if (trimmed.length < 1 || trimmed.length > 12) {
      setError('ユーザー名は 1〜12 文字で入力してください')
      return
    }
    if (containsNG(trimmed)) {
      setError('ユーザー名に使用できない言葉が含まれています')
      return
    }
    if (avatarTextError) {
      setError(`アイコン文字: ${avatarTextError}`)
      return
    }
    if (!handle.trim()) {
      setError('ユーザーIDを入力してください')
      return
    }
    if (handleError) {
      setError(`ユーザーID: ${handleError}`)
      return
    }
    if (!clubId) {
      setError('クラブを選んでください')
      return
    }
    if (jerseyError) {
      setError(`背番号: ${jerseyError}`)
      return
    }

    const jerseyToSend = jerseyNumber.trim() === '' ? null : Number(jerseyNumber)

    setLoading(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: trimmed,
          avatar_text: avatarText.trim() || null,
          handle: handle.trim().toLowerCase(),
          supported_club_id: clubId,
          jersey_number: jerseyToSend,
          favorite_player_id: favoritePlayerId,
          first_match_fixture_id: firstMatchFixtureId,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'エラーが発生しました')
        return
      }
      router.push(next || '/')
      router.refresh()
    } catch (err) {
      setError(`エラー: ${err?.message ?? String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 0' }}>
      <h1 style={{
        fontSize: 22, fontWeight: 900, color: '#fff',
        letterSpacing: '0.08em', margin: '8px 0 28px',
      }}>
        プロフィール{isEdit ? '編集' : '設定'}
      </h1>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* ユーザー名 */}
        <Field label="ユーザー名">
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            maxLength={12}
            required
            style={inputStyle}
          />
        </Field>

        {/* ユーザーID (必須) */}
        <Field label="ユーザーID">
          <input
            type="text"
            value={handle}
            onChange={e => setHandle(e.target.value.toLowerCase())}
            maxLength={20}
            required
            style={{ ...inputStyle, fontFamily: 'monospace' }}
          />
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
            半角英数 + _ - で 3〜20文字 (小文字)。
          </p>
          {handleError && (
            <p style={{ fontSize: 11, color: '#ff6b6b', marginTop: 4 }}>{handleError}</p>
          )}
        </Field>

        {/* あなたのクラブ */}
        <Field label="あなたのクラブ">
          {clubLocked && (
            <div style={{
              fontSize: 11, color: '#e5a53f',
              borderLeft: '2px solid #e5a53f',
              backgroundColor: 'rgba(229,165,63,0.05)',
              padding: '8px 10px', marginBottom: 12,
            }}>
              クラブ変更はクールダウン中（{countdownLabel}で解除）
            </div>
          )}

          {/* J1/J2/J3 タブ */}
          <div style={{
            display: 'flex', gap: 0, marginBottom: 14,
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}>
            {[1, 2, 3].map(tier => {
              const isActive = activeTier === tier
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setActiveTier(tier)}
                  style={{
                    flex: '0 0 auto',
                    padding: '10px 24px',
                    background: 'none',
                    border: 'none',
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.4)',
                    fontSize: 12,
                    fontWeight: isActive ? 800 : 500,
                    letterSpacing: '0.06em',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    borderBottom: isActive ? '2px solid #fff' : '2px solid transparent',
                    marginBottom: -1,
                  }}
                >
                  {TIER_LABEL[tier]}
                </button>
              )
            })}
          </div>

          {/* アクティブな tier のクラブグリッド */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 4,
          }}>
            {(tierGroups[activeTier] ?? []).map(club => {
              const selected = club.id === clubId
              const disabled = clubLocked && club.id !== originalClubId
              const color = normalizeColor(club.color_primary) ?? '#444'
              return (
                <button
                  key={club.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setClubId(club.id)}
                  title={club.name_ja}
                  style={{
                    padding: '8px 4px',
                    border: selected
                      ? `1px solid ${color}`
                      : '1px solid rgba(255,255,255,0.08)',
                    backgroundColor: selected ? color : 'transparent',
                    color: selected ? textColor(color) : 'rgba(255,255,255,0.85)',
                    fontSize: 11,
                    fontWeight: selected ? 800 : 500,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.3 : 1,
                    lineHeight: 1.3,
                    textAlign: 'center',
                    transition: 'background-color 0.12s ease, border-color 0.12s ease',
                    fontFamily: 'inherit',
                  }}
                >
                  {club.short_name ?? club.name_ja}
                </button>
              )
            })}
          </div>
        </Field>

        {/* アイコン (ラベル無し) */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            {/* プレビュー */}
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              backgroundColor: selectedClubColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: textColor(selectedClubColor),
              fontWeight: 800,
              fontSize: avatarDisplay.length === 2 ? 18 : 22,
              flexShrink: 0,
              letterSpacing: avatarDisplay.length === 2 ? '0.02em' : 0,
            }}>
              {avatarDisplay || '?'}
            </div>
            {/* テキスト入力 (2文字幅) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <input
                type="text"
                value={avatarText}
                onChange={e => setAvatarText(e.target.value)}
                maxLength={2}
                style={{
                  ...inputStyle, fontSize: 16, letterSpacing: '0.04em',
                  width: '4em', textAlign: 'center', padding: '6px 8px',
                }}
              />
              {avatarTextError && (
                <div style={{
                  fontSize: 9, color: '#ef5350',
                  letterSpacing: '0.04em',
                }}>
                  {avatarTextError}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ───── プロフィール詳細 (任意) ───── */}
        <div style={{
          paddingTop: 16,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', flexDirection: 'column', gap: 24,
        }}>
          <div style={groupLabelStyle}>プロフィール詳細 (任意)</div>

          {/* 推し選手 */}
          <Field label="推し選手">
            <select
              value={favoritePlayerId ?? ''}
              onChange={handleFavoritePlayerChange}
              disabled={!clubId || playersLoading}
              style={selectStyle}
            >
              <option value="">
                {!clubId ? 'まずクラブを選んでください' : playersLoading ? '読み込み中…' : '— 選択なし —'}
              </option>
              {players.map(p => (
                <option key={p.id} value={p.id}>
                  {p.number != null ? `#${p.number} ` : ''}{p.name_ja || p.name_en} ({p.position ?? '-'})
                </option>
              ))}
            </select>
            <p style={hintStyle}>選ぶと下の背番号に自動入力されます (上書き可)。</p>
          </Field>

          {/* 背番号 */}
          <Field label="背番号">
            <input
              type="number"
              min="1"
              max="99"
              value={jerseyNumber}
              onChange={e => setJerseyNumber(e.target.value)}
              placeholder="1〜99"
              style={{ ...inputStyle, width: '6em' }}
            />
            {jerseyError && (
              <p style={{ fontSize: 11, color: '#ff6b6b', marginTop: 4 }}>{jerseyError}</p>
            )}
          </Field>

          {/* 初観戦試合 */}
          <Field label="初観戦試合">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select
                value={firstMatchYear}
                onChange={e => {
                  setFirstMatchYear(e.target.value)
                  setFirstMatchFixtureId(null)
                }}
                disabled={!clubId}
                style={{ ...selectStyle, flex: '0 0 auto', width: '7em' }}
              >
                <option value="">— 年 —</option>
                {Array.from({ length: CURRENT_YEAR - FIRST_MATCH_YEAR_MIN + 1 }, (_, i) => CURRENT_YEAR - i).map(y => (
                  <option key={y} value={y}>{y}年</option>
                ))}
              </select>
              <select
                value={firstMatchFixtureId ?? ''}
                onChange={e => setFirstMatchFixtureId(e.target.value === '' ? null : Number(e.target.value))}
                disabled={!firstMatchYear || firstMatchLoading}
                style={{ ...selectStyle, flex: '1 1 220px', minWidth: 200 }}
              >
                <option value="">
                  {!firstMatchYear
                    ? '年を選んでください'
                    : firstMatchLoading
                      ? '読み込み中…'
                      : firstMatchFixtures.length === 0
                        ? 'この年の試合はありません'
                        : '— 試合を選ぶ —'}
                </option>
                {firstMatchFixtures.map(f => (
                  <option key={f.id} value={f.id}>
                    {formatFixtureOption(f)}
                  </option>
                ))}
              </select>
            </div>
            <p style={hintStyle}>あなたの「サポーター人生のはじまりの試合」。年を選ぶと当該年の試合が出ます。</p>
          </Field>
        </div>

        {error && (
          <div style={{
            fontSize: 11, color: '#ef5350',
            borderLeft: '2px solid #ef5350',
            backgroundColor: 'rgba(239,83,80,0.05)',
            padding: '8px 12px',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="submit"
            disabled={disableSubmit}
            style={{
              padding: '12px 24px',
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: '0.1em',
              backgroundColor: disableSubmit ? 'rgba(0,255,135,0.2)' : '#00ff87',
              color: disableSubmit ? 'rgba(255,255,255,0.3)' : '#000',
              cursor: disableSubmit ? 'not-allowed' : 'pointer',
              border: 'none',
              textTransform: 'uppercase',
              transition: 'background-color 0.15s ease',
              fontFamily: 'inherit',
            }}
          >
            {loading ? '保存中…' : isEdit ? '変更を保存' : 'プロフィールを作成'}
          </button>
          {isEdit && (
            <button
              type="button"
              onClick={handleSignOut}
              style={{
                padding: '12px 24px',
                fontSize: 12, fontWeight: 800,
                letterSpacing: '0.1em',
                backgroundColor: '#ef5350',
                color: '#fff',
                cursor: 'pointer',
                border: 'none',
                textTransform: 'uppercase',
                transition: 'background-color 0.15s ease',
                fontFamily: 'inherit',
              }}
            >
              サインアウト
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

// Select の option ラベル: "2009年8月8日 vs 鹿島 (H)"
function formatFixtureOption(f) {
  const d = new Date(f.date)
  const m = d.getMonth() + 1
  const day = d.getDate()
  const y = d.getFullYear()
  const opp = f.opp_short || f.opp_name_ja || '-'
  return `${y}年${m}月${day}日 vs ${opp} (${f.is_home ? 'H' : 'A'})`
}

function Field({ label, children }) {
  return (
    <div>
      <label style={fieldLabelStyle}>{label}</label>
      {children}
    </div>
  )
}

const fieldLabelStyle = {
  display: 'block',
  color: '#fff',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.16em',
  marginBottom: 10,
  textTransform: 'uppercase',
}

const groupLabelStyle = {
  color: 'rgba(255,255,255,0.45)',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.18em',
  marginBottom: 8,
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 14,
  border: '1px solid rgba(255,255,255,0.12)',
  backgroundColor: 'transparent',
  color: '#ffffff',
  boxSizing: 'border-box',
  outline: 'none',
  borderRadius: 0,
  fontFamily: 'inherit',
}

const selectStyle = {
  ...inputStyle,
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  // 背景色だけ少し付けないと OS のデフォ option リストが白背景になる場合あり
  backgroundColor: '#111',
  backgroundImage:
    'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'><path d=\'M1 1l4 4 4-4\' stroke=\'%23888\' fill=\'none\' stroke-width=\'1.4\'/></svg>")',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 32,
}

const hintStyle = {
  fontSize: 10,
  color: 'rgba(255,255,255,0.4)',
  marginTop: 6,
}
