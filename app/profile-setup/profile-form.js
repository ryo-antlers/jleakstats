'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { containsNG } from '@/lib/ng-words'

const CLUB_CHANGE_COOLDOWN_DAYS = 7

function textColor(hex) {
  if (!hex || hex.length < 7) return '#fff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? '#fff' : '#000'
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

export default function ProfileForm({ clubs, profile, next }) {
  const router = useRouter()
  const isEdit = Boolean(profile)

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [clubId, setClubId] = useState(profile?.supported_club_id ?? null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const cooldownSeconds = useMemo(() => {
    if (!profile?.club_changed_at) return 0
    const changedAt = new Date(profile.club_changed_at).getTime()
    const unlockAt = changedAt + CLUB_CHANGE_COOLDOWN_DAYS * 86400 * 1000
    return Math.max(0, Math.floor((unlockAt - Date.now()) / 1000))
  }, [profile?.club_changed_at])

  const originalClubId = profile?.supported_club_id ?? null
  const clubLocked = isEdit && cooldownSeconds > 0
  const countdownLabel = formatCountdown(cooldownSeconds)

  const east = clubs.filter(c => c.group_name === 'EAST')
  const west = clubs.filter(c => c.group_name === 'WEST')

  const selectedClub = clubs.find(c => c.id === clubId)
  const clubChangeAttempted = isEdit && clubId !== originalClubId
  const disableSubmit =
    loading ||
    !displayName.trim() ||
    !clubId ||
    (clubLocked && clubChangeAttempted)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    const trimmed = displayName.trim()
    if (trimmed.length < 1 || trimmed.length > 30) {
      setError('表示名は 1〜30 文字で入力してください')
      return
    }
    if (containsNG(trimmed)) {
      setError('表示名に使用できない言葉が含まれています')
      return
    }
    if (!clubId) {
      setError('推しクラブを選んでください')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: trimmed,
          supported_club_id: clubId,
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
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
      minHeight: '80vh', paddingTop: 40,
    }}>
      <div style={{
        width: '100%', maxWidth: 420,
        backgroundColor: '#111111',
        border: '1px solid #2a2a2a',
        padding: 28,
      }}>
        <h1 style={{
          color: '#ffffff', fontSize: 18, fontWeight: 700,
          letterSpacing: '0.06em', textAlign: 'center', margin: 0,
        }}>
          J.LEAK STATS
        </h1>
        <p style={{
          color: '#666666', fontSize: 12, textAlign: 'center',
          marginTop: 6, marginBottom: 24,
        }}>
          {isEdit ? 'プロフィール編集' : '採点・投稿プロフィール設定'}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <Field label="表示名">
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              maxLength={30}
              required
              placeholder="例: サッカー好き"
              style={inputStyle}
            />
            <div style={counterStyle}>{displayName.length} / 30</div>
          </Field>

          <Field label="推しクラブ">
            {clubLocked && (
              <div style={{
                fontSize: 11, color: '#e5a53f',
                border: '1px solid #3a2a14',
                backgroundColor: '#1a1410',
                padding: '8px 10px', marginBottom: 10,
              }}>
                クラブ変更はクールダウン中（{countdownLabel}で解除）
              </div>
            )}

            {[
              { key: 'EAST', clubs: east },
              { key: 'WEST', clubs: west },
            ].map(group => (
              <div key={group.key} style={{ marginBottom: 12 }}>
                <div style={groupLabelStyle}>{group.key}</div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: 4,
                }}>
                  {group.clubs.map(club => {
                    const selected = club.id === clubId
                    const disabled = clubLocked && club.id !== originalClubId
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
                            ? `1px solid ${club.color_primary}`
                            : '1px solid #2a2a2a',
                          backgroundColor: selected ? club.color_primary : '#1a1a1a',
                          color: selected ? textColor(club.color_primary) : '#ffffff',
                          fontSize: 11,
                          fontWeight: selected ? 700 : 500,
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          opacity: disabled ? 0.3 : 1,
                          lineHeight: 1.3,
                          textAlign: 'center',
                        }}
                      >
                        <div>{club.short_name ?? club.name_ja}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            {selectedClub && (
              <div style={{
                fontSize: 11, color: '#888888', marginTop: 4, textAlign: 'center',
              }}>
                選択中:&nbsp;
                <span style={{ color: selectedClub.color_primary, fontWeight: 700 }}>
                  {selectedClub.name_ja}
                </span>
              </div>
            )}
          </Field>

          {error && (
            <div style={{
              fontSize: 12, color: '#ef5350',
              border: '1px solid #3a1a1a', backgroundColor: '#1a0f0f',
              padding: '8px 10px', textAlign: 'center',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={disableSubmit}
            style={{
              marginTop: 4,
              padding: '14px',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.06em',
              backgroundColor: disableSubmit ? '#2a2a2a' : '#00ff87',
              color: disableSubmit ? '#666666' : '#000000',
              opacity: disableSubmit ? 0.6 : 1,
              cursor: disableSubmit ? 'not-allowed' : 'pointer',
              border: 'none',
              width: '100%',
            }}
          >
            {loading ? '保存中…' : isEdit ? '変更を保存' : 'プロフィールを作成'}
          </button>

          <p style={{ color: '#444444', fontSize: 10, textAlign: 'center', margin: 0 }}>
            クラブ変更は {CLUB_CHANGE_COOLDOWN_DAYS} 日間のクールダウンがあります
          </p>
        </form>
      </div>
    </div>
  )
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
  color: '#888888',
  fontSize: 11,
  letterSpacing: '0.1em',
  marginBottom: 8,
  textTransform: 'uppercase',
}

const groupLabelStyle = {
  color: '#444444',
  fontSize: 10,
  letterSpacing: '0.15em',
  marginBottom: 6,
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 14,
  border: '1px solid #2a2a2a',
  backgroundColor: '#1a1a1a',
  color: '#ffffff',
  boxSizing: 'border-box',
  outline: 'none',
  borderRadius: 0,
}

const counterStyle = {
  fontSize: 10,
  color: '#666666',
  marginTop: 4,
  textAlign: 'right',
}
