'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  WATCH_TYPE_LABELS, WATCH_TYPE_ICONS,
} from '../_shared'
import { Send, X } from 'lucide-react'

const NEXT_VISIT_MEMO_MAX = 500
const MATCH_IMPRESSION_MAX = 500
const TIMELINE_MAX_ENTRIES = 30
const TIMELINE_TEXT_MAX = 100
// 先頭の HH:mm を時刻として吸い出す (例「12:30 牛串」「9:05 着いた」)
const TIME_PREFIX_RE = /^(\d{1,2}):(\d{1,2})\s+(.+)$/

function nowHHMM() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 入力テキストから {time, text} を抽出。先頭に HH:mm があればその時刻、なければ現在時刻。
function parseChatEntry(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const m = trimmed.match(TIME_PREFIX_RE)
  if (m) {
    const h = parseInt(m[1], 10)
    const min = parseInt(m[2], 10)
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      return {
        time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
        text: m[3].trim(),
      }
    }
  }
  return { time: nowHHMM(), text: trimmed }
}

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

  // チャット風の 1 行入力欄 (時刻はテキストから自動推測 or 現在時刻)
  const [draft, setDraft] = useState('')
  const draftParsed = draft.trim() ? parseChatEntry(draft) : null

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successFlash, setSuccessFlash] = useState(false)

  function commitDraft() {
    if (!draftParsed) return
    if (!draftParsed.text) return
    if ([...draftParsed.text].length > TIMELINE_TEXT_MAX) return
    if (timeline.length >= TIMELINE_MAX_ENTRIES) return
    setTimeline(prev => [...prev, draftParsed])
    setDraft('')
  }
  function removeTimelineEntry(idx) {
    setTimeline(prev => prev.filter((_, i) => i !== idx))
  }

  const canSendDraft =
    !!draftParsed &&
    draftParsed.text.length > 0 &&
    [...draftParsed.text].length <= TIMELINE_TEXT_MAX &&
    timeline.length < TIMELINE_MAX_ENTRIES

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      // 入力途中のチャットドラフトも保存 (バリデーション通れば)
      const finalTimeline = [...timeline]
      const dp = draft.trim() ? parseChatEntry(draft) : null
      if (dp && dp.text && [...dp.text].length <= TIMELINE_TEXT_MAX) {
        finalTimeline.push(dp)
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
      if (dp) {
        setTimeline(finalTimeline)
        setDraft('')
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

      {/* 1 日のタイムライン (チャット風入力) */}
      <Field label="1 日のタイムライン">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* チャットエントリ (時刻順、上から並ぶ) */}
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

          {/* チャット入力欄 (常駐) */}
          {timeline.length < TIMELINE_MAX_ENTRIES && (
            <ChatInput
              value={draft}
              onChange={setDraft}
              onSend={commitDraft}
              canSend={canSendDraft}
              parsedTime={draftParsed?.time}
              isParsedFromPrefix={draft.trim().match(TIME_PREFIX_RE) !== null}
            />
          )}
          {timeline.length >= TIMELINE_MAX_ENTRIES && (
            <p style={hintStyle}>タイムラインは {TIMELINE_MAX_ENTRIES} 件まで</p>
          )}

          <p style={hintStyle}>
            例:「12:30 牛串とビール」「グッズ列に並んだ」←先頭が HH:mm ならその時刻、なければ送信時の時刻。
          </p>
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

// チャット風の入力欄 (1 行入力 + Enter 送信)
function ChatInput({ value, onChange, onSend, canSend, parsedTime, isParsedFromPrefix }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'center',
      padding: '8px 10px',
      border: '1px solid rgba(0,255,135,0.18)',
      backgroundColor: 'rgba(0,255,135,0.03)',
    }}>
      <span style={{
        flex: '0 0 auto', minWidth: 44,
        fontSize: 11, fontWeight: 700,
        color: parsedTime ? (isParsedFromPrefix ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)') : 'rgba(255,255,255,0.2)',
        fontVariantNumeric: 'tabular-nums',
      }}>{parsedTime ?? '--:--'}</span>
      <textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (canSend) onSend()
          }
        }}
        maxLength={TIMELINE_TEXT_MAX + 12} // HH:mm prefix 分の余裕
        rows={1}
        placeholder="今、何が起きた？ (例: 牛串とビール)"
        style={{
          flex: 1, minWidth: 0,
          padding: '4px 0',
          backgroundColor: 'transparent', border: 'none', outline: 'none',
          color: '#fff', fontFamily: 'inherit',
          fontSize: 14, lineHeight: 1.5,
          resize: 'none', overflow: 'hidden',
        }}
      />
      <button
        type="button"
        onClick={onSend}
        disabled={!canSend}
        aria-label="追加"
        style={{
          width: 32, height: 32, flex: '0 0 auto', padding: 0,
          border: 'none',
          backgroundColor: canSend ? '#00ff87' : 'rgba(0,255,135,0.15)',
          color: canSend ? '#000' : 'rgba(255,255,255,0.3)',
          cursor: canSend ? 'pointer' : 'not-allowed',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'inherit',
        }}
      ><Send size={14} strokeWidth={2.2} /></button>
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
