'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  WATCH_TYPE_LABELS, WATCH_TYPE_ICONS,
} from '../_shared'
import TimelineDisplay from '../timeline-display'
import { Plus, X } from 'lucide-react'

const NEXT_VISIT_MEMO_MAX = 500
const TIMELINE_MAX_ENTRIES = 30
const TIMELINE_TEXT_MAX = 100
const TIME_HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

// afterSaveMode:
//   'redirect-to-notes' (default): 保存後 /notes へ遷移
//   'refresh':                     保存後にページを refresh のみ (/rating/[id] に埋め込み時)
export default function NoteForm({ fixtureId, initialNote, afterSaveMode = 'redirect-to-notes' }) {
  const router = useRouter()
  const isEdit = !!initialNote

  const [watchType, setWatchType] = useState(initialNote?.watch_type ?? 'stadium')
  const [nextVisitMemo, setNextVisitMemo] = useState(initialNote?.next_visit_memo ?? '')
  const [timeline, setTimeline] = useState(() => {
    const initial = Array.isArray(initialNote?.timeline) ? initialNote.timeline : []
    return initial.map(e => ({ time: String(e?.time ?? ''), text: String(e?.text ?? '') }))
  })

  // 常駐インラインエディタ: 一番下に常に「時刻 + テキスト + 追加」が見えている
  const [draftTime, setDraftTime] = useState('')
  const [draftText, setDraftText] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successFlash, setSuccessFlash] = useState(false)

  function commitDraft() {
    const time = draftTime.trim()
    const text = draftText.trim()
    if (!time || !text) return
    if (!TIME_HHMM_RE.test(time)) return
    if ([...text].length > TIMELINE_TEXT_MAX) return
    if (timeline.length >= TIMELINE_MAX_ENTRIES) return
    setTimeline(prev => [...prev, { time, text }])
    setDraftTime('')
    setDraftText('')
  }
  function removeTimelineEntry(idx) {
    setTimeline(prev => prev.filter((_, i) => i !== idx))
  }

  const canAddDraft =
    draftTime.trim().length > 0 &&
    draftText.trim().length > 0 &&
    TIME_HHMM_RE.test(draftTime.trim()) &&
    [...draftText.trim()].length <= TIMELINE_TEXT_MAX &&
    timeline.length < TIMELINE_MAX_ENTRIES

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      // 入力途中のドラフトも保存 (バリデーション通れば)
      const finalTimeline = [...timeline]
      const dt = draftTime.trim()
      const dx = draftText.trim()
      if (dt && dx && TIME_HHMM_RE.test(dt) && [...dx].length <= TIMELINE_TEXT_MAX) {
        finalTimeline.push({ time: dt, text: dx })
      }
      const res = await fetch('/api/watch-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixture_id: fixtureId,
          watch_type: watchType,
          next_visit_memo: nextVisitMemo.trim() || null,
          timeline: finalTimeline,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'エラーが発生しました')
        return
      }
      // 保存成功したらドラフトクリア
      if (dt && dx) {
        setTimeline(finalTimeline)
        setDraftTime('')
        setDraftText('')
      }
      if (afterSaveMode === 'refresh') {
        setSuccessFlash(true)
        setTimeout(() => setSuccessFlash(false), 1500)
        router.refresh()
      } else {
        router.push('/notes')
        router.refresh()
      }
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
      if (afterSaveMode === 'refresh') {
        router.refresh()
      } else {
        router.push('/notes')
        router.refresh()
      }
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {['stadium', 'streaming', 'no_watch'].map(k => (
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

      {/* 次回観戦時の備忘メモ */}
      <Field label="次回観戦時の備忘メモ">
        <textarea
          value={nextVisitMemo}
          onChange={e => setNextVisitMemo(e.target.value)}
          maxLength={NEXT_VISIT_MEMO_MAX}
          placeholder="例: 駐車場が満車だった、コンビニで弁当買い忘れた、ゴール裏は寒い…次の自分へのヒント"
          rows={6}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 100, fontFamily: 'inherit' }}
        />
      </Field>

      {/* 1 日のタイムライン (常駐インラインエディタ) */}
      <Field label="1 日のタイムライン">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* 確定済みエントリ */}
          {timeline.length === 0 && (
            <p style={hintStyle}>
              「並んだもの」「食べたもの」「買ったもの」など、その日の出来事を時刻つきで残せます。
            </p>
          )}
          {timeline.map((entry, idx) => (
            <div key={idx} style={committedRowStyle}>
              <span style={{
                fontSize: 13, fontWeight: 700, letterSpacing: '0.02em',
                color: '#fff', fontVariantNumeric: 'tabular-nums',
                width: 60, flex: '0 0 60px',
              }}>{entry.time}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#fff' }}>{entry.text}</span>
              <button
                type="button"
                onClick={() => removeTimelineEntry(idx)}
                aria-label="この行を削除"
                style={{
                  width: 28, height: 28, padding: 0, flex: '0 0 auto',
                  background: 'transparent', border: 'none',
                  color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}
              ><X size={14} strokeWidth={1.8} /></button>
            </div>
          ))}

          {/* 常駐インラインエディタ (一番下) */}
          {timeline.length < TIMELINE_MAX_ENTRIES && (
            <div style={draftRowStyle}>
              <input
                type="time"
                value={draftTime}
                onChange={e => setDraftTime(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && canAddDraft) { e.preventDefault(); commitDraft() } }}
                style={{
                  ...inputStyle, width: 110, flex: '0 0 110px',
                  padding: '8px 10px',
                }}
              />
              <input
                type="text"
                value={draftText}
                onChange={e => setDraftText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && canAddDraft) { e.preventDefault(); commitDraft() } }}
                maxLength={TIMELINE_TEXT_MAX}
                placeholder="例: 牛串とビール / グッズ列に並んだ"
                style={{ ...inputStyle, flex: 1, minWidth: 0, padding: '8px 10px' }}
              />
              <button
                type="button"
                onClick={commitDraft}
                disabled={!canAddDraft}
                aria-label="追加"
                style={{
                  width: 36, height: 36, flex: '0 0 auto', padding: 0,
                  border: '1px solid rgba(0,255,135,0.6)',
                  backgroundColor: canAddDraft ? 'rgba(0,255,135,0.15)' : 'rgba(255,255,255,0.02)',
                  color: canAddDraft ? '#00ff87' : 'rgba(255,255,255,0.25)',
                  cursor: canAddDraft ? 'pointer' : 'not-allowed',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'inherit',
                }}
              ><Plus size={16} strokeWidth={2} /></button>
            </div>
          )}
          {timeline.length >= TIMELINE_MAX_ENTRIES && (
            <p style={hintStyle}>タイムラインは {TIMELINE_MAX_ENTRIES} 件まで</p>
          )}
        </div>
      </Field>

      {successFlash && (
        <div style={{
          padding: '10px 14px',
          backgroundColor: 'rgba(0,255,135,0.12)',
          border: '1px solid #00ff87',
          color: '#00ff87',
          fontSize: 11, fontWeight: 800,
          letterSpacing: '0.06em',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 14 }}>✓</span>
          <span>観戦記録を保存しました</span>
        </div>
      )}

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

function RadioCard({ selected, onClick, icon: Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '14px 4px 12px',
        border: selected ? '1px solid #00ff87' : '1px solid rgba(255,255,255,0.12)',
        backgroundColor: selected ? 'rgba(0,255,135,0.1)' : 'transparent',
        color: selected ? '#00ff87' : 'rgba(255,255,255,0.85)',
        cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        fontSize: 11, fontWeight: selected ? 800 : 500,
        transition: 'all 0.12s ease',
      }}
    >
      {Icon ? <Icon size={20} strokeWidth={1.6} /> : null}
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

const committedRowStyle = {
  display: 'flex', gap: 10, alignItems: 'center',
  padding: '8px 10px',
  border: '1px solid rgba(255,255,255,0.06)',
  backgroundColor: 'rgba(255,255,255,0.02)',
}

const draftRowStyle = {
  display: 'flex', gap: 6, alignItems: 'center',
  padding: 4,
  borderTop: '1px dashed rgba(255,255,255,0.12)',
  marginTop: 4,
}
