'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  WATCH_TYPE_LABELS, WATCH_TYPE_ICONS,
} from '../_shared'
import { Plus, X } from 'lucide-react'

const NEXT_VISIT_MEMO_MAX = 500
const MATCH_IMPRESSION_MAX = 500
const TIMELINE_MAX_ENTRIES = 30
const TIMELINE_TEXT_MAX = 100
const TIME_HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

// afterSaveMode:
//   'redirect-to-notes' (default): 保存後 /notes へ遷移
//   'refresh':                     保存後にページを refresh のみ (/rating/[id] に埋め込み時)
// venueName: スタジアム名 (忘備録ラベル「(venueName) 忘備録」のために使う、null なら「忘備録」)
export default function NoteForm({ fixtureId, initialNote, afterSaveMode = 'redirect-to-notes', venueName = null }) {
  const router = useRouter()
  const isEdit = !!initialNote

  const [watchType, setWatchType] = useState(initialNote?.watch_type ?? 'stadium')
  const [matchImpression, setMatchImpression] = useState(initialNote?.match_impression ?? '')
  const [nextVisitMemo, setNextVisitMemo] = useState(initialNote?.next_visit_memo ?? '')
  const [timeline, setTimeline] = useState(() => {
    const initial = Array.isArray(initialNote?.timeline) ? initialNote.timeline : []
    return initial.map(e => ({ time: String(e?.time ?? ''), text: String(e?.text ?? '') }))
  })

  // 時刻と文章を分けた入力 (常駐)
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
          match_impression: matchImpression.trim() || null,
          next_visit_memo: watchType === 'stadium' ? (nextVisitMemo.trim() || null) : null,
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
      {/* 観戦区分 (stadium / streaming の 2 択) */}
      <Field label="観戦区分">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {['stadium', 'streaming'].map(k => (
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

      {/* 試合の感想 (stadium / streaming どちらも表示、掲示板風入力) */}
      <Field label="試合の感想">
        <BareTextarea
          value={matchImpression}
          onChange={e => setMatchImpression(e.target.value)}
          maxLength={MATCH_IMPRESSION_MAX}
        />
      </Field>

      {/* スタジアム忘備録 (stadium のみ、ラベルに venue 名) */}
      {watchType === 'stadium' && (
        <Field label={`${venueName ? `${venueName} ` : ''}忘備録`}>
          <BareTextarea
            value={nextVisitMemo}
            onChange={e => setNextVisitMemo(e.target.value)}
            maxLength={NEXT_VISIT_MEMO_MAX}
          />
        </Field>
      )}

      {/* 1 日のタイムライン (時刻 + 文章 を分けて入力) */}
      <Field label="1 日のタイムライン">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* 確定済みエントリ (時刻順) */}
          {[...timeline]
            .sort((a, b) => String(a.time).localeCompare(String(b.time)))
            .map((entry, displayIdx) => {
              const realIdx = timeline.findIndex(e => e === entry || (e.time === entry.time && e.text === entry.text))
              return (
                <ChatRow
                  key={`${entry.time}-${entry.text}-${displayIdx}`}
                  entry={entry}
                  onRemove={() => removeTimelineEntry(realIdx)}
                />
              )
            })}

          {/* 時刻 + 文章 + 追加ボタン (常駐) */}
          {timeline.length < TIMELINE_MAX_ENTRIES && (
            <SplitDraftRow
              draftTime={draftTime}
              setDraftTime={setDraftTime}
              draftText={draftText}
              setDraftText={setDraftText}
              onCommit={commitDraft}
              canCommit={canAddDraft}
            />
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

      <div style={{
        display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'stretch',
        marginTop: 8,
      }}>
        <button
          type="submit"
          disabled={loading}
          style={{
            flex: '1 1 240px', minHeight: 56,
            padding: '16px 28px', fontSize: 15, fontWeight: 900,
            letterSpacing: '0.14em',
            backgroundColor: loading ? 'rgba(0,255,135,0.25)' : '#00ff87',
            color: loading ? 'rgba(255,255,255,0.35)' : '#000',
            cursor: loading ? 'not-allowed' : 'pointer',
            border: 'none', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: loading ? 'none' : '0 4px 0 rgba(0,0,0,0.5), 0 6px 20px rgba(0,255,135,0.18)',
            transform: loading ? 'translateY(2px)' : 'translateY(0)',
            transition: 'transform 0.12s ease, box-shadow 0.12s ease',
          }}
        >
          {!loading && <span style={{ fontSize: 18, lineHeight: 1 }}>✓</span>}
          <span>{loading ? '保存中…' : isEdit ? '変更を保存する' : 'ノートを保存する'}</span>
        </button>
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

// 掲示板スタイルの「裸」textarea
//   - 枠なし、textarea 自身に下線
//   - 1 行から開始、内容に応じて自動拡張 (scrollHeight)
//   - 例文プレースホルダ・文字数カウントなし
function BareTextarea({ value, onChange, maxLength }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      maxLength={maxLength}
      rows={1}
      style={{
        width: '100%', boxSizing: 'border-box',
        padding: '4px 0',
        backgroundColor: 'transparent',
        border: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.18)',
        outline: 'none',
        color: '#fff', fontFamily: 'inherit',
        fontSize: 14, lineHeight: 1.65,
        resize: 'none', overflow: 'hidden',
      }}
    />
  )
}

// チャットエントリの読み取り表示
function ChatRow({ entry, onRemove }) {
  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'baseline',
      padding: '8px 10px',
      border: '1px solid rgba(255,255,255,0.06)',
      backgroundColor: 'rgba(255,255,255,0.02)',
    }}>
      <span style={{
        fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
        color: '#00ff87', fontVariantNumeric: 'tabular-nums',
        width: 48, flex: '0 0 48px',
      }}>{entry.time}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.5, color: '#fff' }}>{entry.text}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label="この行を削除"
        style={{
          width: 24, height: 24, padding: 0, flex: '0 0 auto',
          background: 'transparent', border: 'none',
          color: 'rgba(255,255,255,0.35)', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      ><X size={14} strokeWidth={1.8} /></button>
    </div>
  )
}

// 時刻 + 文章 を分けて入力する常駐ドラフト行
//   - 時刻は <input type="time"> ピッカー
//   - 文章は 1 行テキスト (空欄から開始、Enter で追加)
function SplitDraftRow({ draftTime, setDraftTime, draftText, setDraftText, onCommit, canCommit }) {
  function onKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (canCommit) onCommit()
    }
  }
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'center',
      padding: '4px 0',
      borderTop: '1px dashed rgba(255,255,255,0.12)',
      marginTop: 4, paddingTop: 10,
    }}>
      <input
        type="time"
        value={draftTime}
        onChange={e => setDraftTime(e.target.value)}
        onKeyDown={onKey}
        style={{
          width: 110, flex: '0 0 110px',
          padding: '8px 10px', fontSize: 14,
          border: '1px solid rgba(255,255,255,0.18)',
          backgroundColor: 'transparent', color: '#fff',
          outline: 'none', borderRadius: 0, fontFamily: 'inherit',
        }}
      />
      <input
        type="text"
        value={draftText}
        onChange={e => setDraftText(e.target.value)}
        onKeyDown={onKey}
        maxLength={TIMELINE_TEXT_MAX}
        placeholder="例: 牛串とビール / グッズ列に並んだ"
        style={{
          flex: 1, minWidth: 0,
          padding: '8px 10px', fontSize: 14,
          border: '1px solid rgba(255,255,255,0.18)',
          backgroundColor: 'transparent', color: '#fff',
          outline: 'none', borderRadius: 0, fontFamily: 'inherit',
        }}
      />
      <button
        type="button"
        onClick={onCommit}
        disabled={!canCommit}
        aria-label="追加"
        style={{
          width: 36, height: 36, flex: '0 0 auto', padding: 0,
          border: 'none',
          backgroundColor: canCommit ? '#00ff87' : 'rgba(0,255,135,0.15)',
          color: canCommit ? '#000' : 'rgba(255,255,255,0.3)',
          cursor: canCommit ? 'pointer' : 'not-allowed',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'inherit',
        }}
      ><Plus size={16} strokeWidth={2} /></button>
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
