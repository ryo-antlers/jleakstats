'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  WATCH_TYPE_LABELS, WATCH_TYPE_ICONS, ACCESS_LABELS, ACCESS_ICONS,
} from '../_shared'

const COMPANION_MAX = 50
const MEMO_MAX = 500

export default function NoteForm({ fixtureId, initialNote }) {
  const router = useRouter()
  const isEdit = !!initialNote

  const [watchType, setWatchType] = useState(initialNote?.watch_type ?? 'stadium')
  const [access, setAccess] = useState(initialNote?.access ?? '')
  const [companion, setCompanion] = useState(initialNote?.companion ?? '')
  const [memo, setMemo] = useState(initialNote?.memo ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/watch-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixture_id: fixtureId,
          watch_type: watchType,
          access: watchType === 'stadium' ? (access || null) : null,
          companion: companion.trim() || null,
          memo: memo.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'エラーが発生しました')
        return
      }
      router.push('/notes')
      router.refresh()
    } catch (err) {
      setError(`エラー: ${err?.message ?? String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!confirm('このノートを削除しますか？')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/watch-notes?fixture_id=${fixtureId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '削除に失敗しました')
        return
      }
      router.push('/notes')
      router.refresh()
    } catch (err) {
      setError(`エラー: ${err?.message ?? String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{
      display: 'flex', flexDirection: 'column', gap: 28,
      maxWidth: 640, margin: '0 auto',
    }}>
      {/* 観戦区分 */}
      <Field label="観戦区分">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {['stadium', 'dazn', 'tv', 'no_watch'].map(k => (
            <RadioCard
              key={k}
              selected={watchType === k}
              onClick={() => setWatchType(k)}
              icon={WATCH_TYPE_ICONS[k]}
              label={WATCH_TYPE_LABELS[k]}
            />
          ))}
        </div>
      </Field>

      {/* アクセス手段 (stadium のみ表示) */}
      {watchType === 'stadium' && (
        <Field label="アクセス手段">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {['train', 'car', 'bus', 'walk', 'other'].map(k => (
              <RadioCard
                key={k}
                selected={access === k}
                onClick={() => setAccess(k === access ? '' : k)}
                icon={ACCESS_ICONS[k]}
                label={ACCESS_LABELS[k]}
              />
            ))}
          </div>
          <p style={hintStyle}>選択しなくても OK (再タップで解除)</p>
        </Field>
      )}

      {/* 同行者 */}
      <Field label="同行者 (任意)">
        <input
          type="text"
          value={companion}
          onChange={e => setCompanion(e.target.value)}
          maxLength={COMPANION_MAX}
          placeholder="例: 妻と / ゴール裏の仲間と / ひとり"
          style={inputStyle}
        />
        <p style={hintStyle}>{[...companion].length}/{COMPANION_MAX}</p>
      </Field>

      {/* メモ */}
      <Field label="メモ (任意)">
        <textarea
          value={memo}
          onChange={e => setMemo(e.target.value)}
          maxLength={MEMO_MAX}
          placeholder="試合の感想・印象に残ったプレー・天候など、自由に"
          rows={6}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 100, fontFamily: 'inherit' }}
        />
        <p style={hintStyle}>{[...memo].length}/{MEMO_MAX}</p>
      </Field>

      {error && (
        <div style={{
          fontSize: 11, color: '#ef5350',
          borderLeft: '2px solid #ef5350',
          backgroundColor: 'rgba(239,83,80,0.05)',
          padding: '8px 12px',
        }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '12px 24px', fontSize: 12, fontWeight: 800,
            letterSpacing: '0.1em',
            backgroundColor: loading ? 'rgba(0,255,135,0.2)' : '#00ff87',
            color: loading ? 'rgba(255,255,255,0.3)' : '#000',
            cursor: loading ? 'not-allowed' : 'pointer',
            border: 'none', textTransform: 'uppercase', fontFamily: 'inherit',
          }}
        >{loading ? '保存中…' : isEdit ? '変更を保存' : 'ノートを作成'}</button>
        {isEdit && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            style={{
              padding: '12px 24px', fontSize: 12, fontWeight: 800,
              letterSpacing: '0.1em',
              backgroundColor: 'transparent',
              color: '#ef5350',
              cursor: loading ? 'not-allowed' : 'pointer',
              border: '1px solid #ef5350', textTransform: 'uppercase', fontFamily: 'inherit',
            }}
          >削除</button>
        )}
      </div>
    </form>
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

function RadioCard({ selected, onClick, icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '12px 4px',
        border: selected ? '1px solid #00ff87' : '1px solid rgba(255,255,255,0.12)',
        backgroundColor: selected ? 'rgba(0,255,135,0.1)' : 'transparent',
        color: selected ? '#00ff87' : 'rgba(255,255,255,0.85)',
        cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        fontSize: 11, fontWeight: selected ? 800 : 500,
        transition: 'all 0.12s ease',
      }}
    >
      <span style={{ fontSize: 20, lineHeight: 1 }}>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

const fieldLabelStyle = {
  display: 'block', color: '#fff',
  fontSize: 11, fontWeight: 800, letterSpacing: '0.16em',
  marginBottom: 10, textTransform: 'uppercase',
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px', fontSize: 14,
  border: '1px solid rgba(255,255,255,0.12)',
  backgroundColor: 'transparent',
  color: '#ffffff', boxSizing: 'border-box',
  outline: 'none', borderRadius: 0, fontFamily: 'inherit',
}

const hintStyle = {
  fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 6,
}
