'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  WATCH_TYPE_LABELS, WATCH_TYPE_ICONS, ACCESS_LABELS, ACCESS_ICONS,
  SEAT_TYPE_LABELS, SEAT_TYPE_ICONS,
} from '../_shared'
import TimelineDisplay from '../timeline-display'
import { PREFECTURES } from '@/lib/jp/prefectures'
import { municipalities } from '@/lib/jp/municipalities'

const COMPANION_MAX = 50
const NEXT_VISIT_MEMO_MAX = 500
const TIMELINE_MAX_ENTRIES = 30
const TIMELINE_TEXT_MAX = 100

// afterSaveMode:
//   'redirect-to-notes' (default): 保存後 /notes へ遷移 (従来の /notes/[fixture_id] 動作)
//   'refresh':                     保存後にページを refresh のみ (例: /rating/[id] に埋め込む場合)
export default function NoteForm({ fixtureId, initialNote, afterSaveMode = 'redirect-to-notes' }) {
  const router = useRouter()
  const isEdit = !!initialNote

  const [watchType, setWatchType] = useState(initialNote?.watch_type ?? 'stadium')
  const [access, setAccess] = useState(initialNote?.access ?? '')
  const [seatType, setSeatType] = useState(initialNote?.seat_type ?? '')
  const [companion, setCompanion] = useState(initialNote?.companion ?? '')
  const [nextVisitMemo, setNextVisitMemo] = useState(initialNote?.next_visit_memo ?? '')
  const [departurePrefecture, setDeparturePrefecture] = useState(initialNote?.departure_prefecture ?? '')
  const [departureCity, setDepartureCity] = useState(initialNote?.departure_city ?? '')
  const [timeline, setTimeline] = useState(() => {
    const initial = Array.isArray(initialNote?.timeline) ? initialNote.timeline : []
    return initial.map(e => ({ time: String(e?.time ?? ''), text: String(e?.text ?? '') }))
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successFlash, setSuccessFlash] = useState(false)

  function updateTimelineEntry(idx, patch) {
    setTimeline(prev => prev.map((e, i) => i === idx ? { ...e, ...patch } : e))
  }
  function addTimelineEntry() {
    if (timeline.length >= TIMELINE_MAX_ENTRIES) return
    setTimeline(prev => [...prev, { time: '', text: '' }])
  }
  function removeTimelineEntry(idx) {
    setTimeline(prev => prev.filter((_, i) => i !== idx))
  }

  const cityOptions = departurePrefecture ? (municipalities[departurePrefecture] ?? []) : []

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      // 空の行は除外して送信
      const cleanTimeline = timeline
        .map(e => ({ time: e.time.trim(), text: e.text.trim() }))
        .filter(e => e.time || e.text)
      const res = await fetch('/api/watch-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixture_id: fixtureId,
          watch_type: watchType,
          access: watchType === 'stadium' ? (access || null) : null,
          seat_type: watchType === 'stadium' ? (seatType || null) : null,
          companion: companion.trim() || null,
          next_visit_memo: nextVisitMemo.trim() || null,
          departure_prefecture: watchType === 'stadium' ? (departurePrefecture || null) : null,
          departure_city: watchType === 'stadium' && departurePrefecture && departureCity ? departureCity : null,
          timeline: cleanTimeline,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'エラーが発生しました')
        return
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

      {/* 座席タイプ (stadium のみ表示) */}
      {watchType === 'stadium' && (
        <Field label="座席">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {['goal_back', 'reserved'].map(k => (
              <RadioCard
                key={k}
                selected={seatType === k}
                onClick={() => setSeatType(k === seatType ? '' : k)}
                icon={SEAT_TYPE_ICONS[k]}
                label={SEAT_TYPE_LABELS[k]}
              />
            ))}
          </div>
          <p style={hintStyle}>選択しなくても OK (再タップで解除)</p>
        </Field>
      )}

      {/* 出発地 (stadium のみ表示) — 移動距離計算に使う */}
      {watchType === 'stadium' && (
        <Field label="出発地">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={departurePrefecture}
              onChange={e => {
                setDeparturePrefecture(e.target.value)
                setDepartureCity('')
              }}
              style={{ ...selectStyle, flex: '1 1 140px', minWidth: 120 }}
            >
              <option value="">— 都道府県 —</option>
              {PREFECTURES.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              value={departureCity}
              onChange={e => setDepartureCity(e.target.value)}
              disabled={!departurePrefecture}
              style={{ ...selectStyle, flex: '2 1 200px', minWidth: 160 }}
            >
              <option value="">{departurePrefecture ? '— 市区町村 —' : '都道府県を選ぶと有効'}</option>
              {cityOptions.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <p style={hintStyle}>市区町村まで設定すると「今季の観戦総移動距離」の精度が上がります。</p>
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

      {/* 次回観戦時の備忘メモ */}
      <Field label="次回観戦時の備忘メモ (任意)">
        <textarea
          value={nextVisitMemo}
          onChange={e => setNextVisitMemo(e.target.value)}
          maxLength={NEXT_VISIT_MEMO_MAX}
          placeholder="例: 駐車場が満車だった、コンビニで弁当買い忘れた、ゴール裏は寒い…次の自分へのヒント"
          rows={6}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 100, fontFamily: 'inherit' }}
        />
        <p style={hintStyle}>{[...nextVisitMemo].length}/{NEXT_VISIT_MEMO_MAX}</p>
      </Field>

      {/* 1 日のタイムライン (時刻 + 1 行テキスト) */}
      <Field label="1 日のタイムライン (任意)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {timeline.length === 0 && (
            <p style={{ ...hintStyle, marginTop: 0 }}>
              「並んだもの」「食べたもの」「買ったもの」など、その日の出来事を時刻つきで残せます。
            </p>
          )}
          {timeline.map((entry, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="time"
                value={entry.time}
                onChange={e => updateTimelineEntry(idx, { time: e.target.value })}
                style={{ ...inputStyle, width: 110, flex: '0 0 auto' }}
              />
              <input
                type="text"
                value={entry.text}
                onChange={e => updateTimelineEntry(idx, { text: e.target.value })}
                maxLength={TIMELINE_TEXT_MAX}
                placeholder="例: 牛串とビール / グッズ列に並んだ"
                style={{ ...inputStyle, flex: 1, minWidth: 0 }}
              />
              <button
                type="button"
                onClick={() => removeTimelineEntry(idx)}
                aria-label="この行を削除"
                style={{
                  width: 32, height: 32, flex: '0 0 auto',
                  border: '1px solid rgba(255,255,255,0.12)',
                  backgroundColor: 'transparent',
                  color: 'rgba(255,255,255,0.5)',
                  cursor: 'pointer', fontSize: 14, fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >×</button>
            </div>
          ))}
          <button
            type="button"
            onClick={addTimelineEntry}
            disabled={timeline.length >= TIMELINE_MAX_ENTRIES}
            style={{
              padding: '10px 14px', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.1em',
              backgroundColor: 'transparent',
              color: timeline.length >= TIMELINE_MAX_ENTRIES ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.7)',
              cursor: timeline.length >= TIMELINE_MAX_ENTRIES ? 'not-allowed' : 'pointer',
              border: '1px dashed rgba(255,255,255,0.2)',
              textTransform: 'uppercase', fontFamily: 'inherit',
              alignSelf: 'flex-start',
            }}
          >+ 行を追加</button>
          <p style={hintStyle}>
            {timeline.length}/{TIMELINE_MAX_ENTRIES} 行 ・ 保存時に時刻順に並びます
          </p>
        </div>

        {/* 入力中ライブプレビュー (時刻もテキストも入っている行のみ) */}
        {timeline.some(e => e.time && e.text.trim()) && (
          <div style={{
            marginTop: 16,
            padding: '14px 12px',
            border: '1px solid rgba(255,255,255,0.08)',
            backgroundColor: 'rgba(255,255,255,0.02)',
          }}>
            <p style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.2em',
              color: 'rgba(255,255,255,0.35)', margin: '0 0 12px',
              textTransform: 'uppercase',
            }}>Preview</p>
            <TimelineDisplay entries={timeline.filter(e => e.time && e.text.trim())} />
          </div>
        )}
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

const selectStyle = {
  ...inputStyle,
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  backgroundColor: '#111',
  backgroundImage:
    'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'><path d=\'M1 1l4 4 4-4\' stroke=\'%23888\' fill=\'none\' stroke-width=\'1.4\'/></svg>")',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 32,
}

const hintStyle = {
  fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 6,
}
