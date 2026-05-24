'use client'
// Variant C: Brutalist Mono
//   - 極限ミニマル・モノクローム・ハーフライン
//   - radio = テキストリンク (チェックマークだけ表示)
//   - timeline = indented bullet list (シンプル)
//   - 配色 = 95% モノクロ、緑は飾り程度
//   - 余白を大胆に取る (Linear / Cron 風)

import { useRouter } from 'next/navigation'
import { useWatchNoteState, WATCH_NOTE_LIMITS } from '@/app/notes/use-watch-note-state'
import { WATCH_TYPE_LABELS, ACCESS_LABELS, SEAT_TYPE_LABELS } from '@/app/notes/_shared'
import { PREFECTURES } from '@/lib/jp/prefectures'
import { municipalities } from '@/lib/jp/municipalities'
import RatingPageView from '@/app/rating/rating-view'
import { Check } from 'lucide-react'

const MONO = 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace'
const WHITE = 'rgba(255,255,255,0.92)'
const MUTED = 'rgba(255,255,255,0.45)'
const FAINT = 'rgba(255,255,255,0.18)'

export default function VariantBrutalist({ fixtureId, fixture, lineups, teamInfo, myRatings, viewOnly, note, isNoWatch }) {
  const router = useRouter()
  const s = useWatchNoteState(fixtureId, note)

  async function handleSubmit(e) {
    e.preventDefault()
    await s.save({ onSuccess: () => router.refresh() })
  }

  return (
    <div style={{ maxWidth: 540, margin: '0 auto', paddingInline: 22 }}>
      {/* 極小ヘッダー */}
      <header style={{ marginBottom: 56 }}>
        <div style={{
          fontSize: 10, fontFamily: MONO, color: MUTED,
          letterSpacing: '0.04em',
        }}>watch_note ─ #{fixtureId}</div>
      </header>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 44 }}>
        <FieldRow label="watched as">
          <TextOptions
            options={['stadium', 'dazn', 'tv', 'no_watch']}
            labels={WATCH_TYPE_LABELS}
            value={s.watchType}
            onChange={s.setWatchType}
          />
        </FieldRow>

        {s.watchType === 'stadium' && (
          <>
            <FieldRow label="access">
              <TextOptions
                options={['train', 'car', 'bus', 'walk', 'other']}
                labels={ACCESS_LABELS}
                value={s.access}
                onChange={v => s.setAccess(v === s.access ? '' : v)}
                clearable
              />
            </FieldRow>

            <FieldRow label="seat">
              <TextOptions
                options={['goal_back', 'reserved']}
                labels={SEAT_TYPE_LABELS}
                value={s.seatType}
                onChange={v => s.setSeatType(v === s.seatType ? '' : v)}
                clearable
              />
            </FieldRow>

            <FieldRow label="from">
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <ThinSelect
                  value={s.departurePrefecture}
                  onChange={e => { s.setDeparturePrefecture(e.target.value); s.setDepartureCity('') }}
                >
                  <option value="">— prefecture —</option>
                  {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
                </ThinSelect>
                <span style={{ color: MUTED }}>/</span>
                <ThinSelect
                  value={s.departureCity}
                  onChange={e => s.setDepartureCity(e.target.value)}
                  disabled={!s.departurePrefecture}
                >
                  <option value="">{s.departurePrefecture ? '— city —' : ''}</option>
                  {(municipalities[s.departurePrefecture] ?? []).map(c => <option key={c} value={c}>{c}</option>)}
                </ThinSelect>
              </div>
            </FieldRow>
          </>
        )}

        <FieldRow label="with">
          <ThinInput
            type="text"
            value={s.companion}
            onChange={e => s.setCompanion(e.target.value)}
            maxLength={WATCH_NOTE_LIMITS.COMPANION_MAX}
            placeholder="—"
          />
        </FieldRow>

        <FieldRow label="memo for next time">
          <textarea
            value={s.nextVisitMemo}
            onChange={e => s.setNextVisitMemo(e.target.value)}
            maxLength={WATCH_NOTE_LIMITS.NEXT_VISIT_MEMO_MAX}
            placeholder="—"
            rows={4}
            style={{
              width: '100%', padding: '6px 0', resize: 'vertical',
              border: 'none', borderBottom: `1px solid ${FAINT}`,
              backgroundColor: 'transparent', color: WHITE,
              fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6,
              outline: 'none', minHeight: 60,
            }}
          />
          <div style={{ fontSize: 9, fontFamily: MONO, color: MUTED, marginTop: 4 }}>
            {[...s.nextVisitMemo].length}/{WATCH_NOTE_LIMITS.NEXT_VISIT_MEMO_MAX}
          </div>
        </FieldRow>

        {/* タイムライン */}
        <FieldRow label="the day">
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {s.timeline.map((entry, idx) => (
              <li key={idx} style={{
                display: 'grid', gridTemplateColumns: '12px 80px 1fr 24px',
                alignItems: 'center', gap: 10,
              }}>
                <span style={{ color: MUTED, fontFamily: MONO, fontSize: 11 }}>·</span>
                <input
                  type="time"
                  value={entry.time}
                  onChange={e => s.updateTimelineEntry(idx, { time: e.target.value })}
                  style={{
                    padding: '4px 0', border: 'none',
                    borderBottom: `1px solid ${FAINT}`,
                    backgroundColor: 'transparent', color: WHITE,
                    fontFamily: MONO, fontSize: 13, letterSpacing: '0.02em',
                    outline: 'none',
                  }}
                />
                <input
                  type="text"
                  value={entry.text}
                  onChange={e => s.updateTimelineEntry(idx, { text: e.target.value })}
                  maxLength={WATCH_NOTE_LIMITS.TIMELINE_TEXT_MAX}
                  placeholder="—"
                  style={{
                    padding: '4px 0', border: 'none',
                    borderBottom: `1px solid ${FAINT}`,
                    backgroundColor: 'transparent', color: WHITE,
                    fontFamily: 'inherit', fontSize: 14,
                    outline: 'none', width: '100%',
                  }}
                />
                <button type="button" onClick={() => s.removeTimelineEntry(idx)} aria-label="削除"
                  style={{
                    width: 20, height: 20, border: 'none', background: 'transparent',
                    color: MUTED, cursor: 'pointer', fontSize: 14, padding: 0,
                  }}>×</button>
              </li>
            ))}
          </ol>
          <button type="button" onClick={s.addTimelineEntry}
            disabled={s.timeline.length >= WATCH_NOTE_LIMITS.TIMELINE_MAX_ENTRIES}
            style={{
              marginTop: 14, padding: 0,
              border: 'none', background: 'transparent',
              color: MUTED, fontFamily: MONO, fontSize: 12,
              cursor: 'pointer', letterSpacing: '0.04em',
              borderBottom: `1px solid ${MUTED}`,
            }}>+ add line</button>

          {/* シンプルなプレビュー */}
          {s.timeline.some(e => e.time && e.text.trim()) && (
            <div style={{ marginTop: 28, paddingLeft: 20, borderLeft: `1px solid ${FAINT}` }}>
              {s.timeline
                .filter(e => e.time && e.text.trim())
                .sort((a, b) => a.time.localeCompare(b.time))
                .map((e, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 14, paddingBlock: 6,
                    fontSize: 13, color: WHITE,
                  }}>
                    <span style={{ fontFamily: MONO, color: MUTED, flex: '0 0 50px' }}>{e.time}</span>
                    <span>{e.text}</span>
                  </div>
                ))}
            </div>
          )}
        </FieldRow>

        <FlashRow successFlash={s.successFlash} error={s.error} />

        <div style={{ display: 'flex', gap: 24, paddingTop: 16, alignItems: 'center' }}>
          <button type="submit" disabled={s.loading}
            style={{
              padding: '10px 0', minWidth: 100,
              border: 'none', borderBottom: `2px solid ${s.loading ? FAINT : '#fff'}`,
              backgroundColor: 'transparent',
              color: s.loading ? MUTED : '#fff',
              fontFamily: MONO, fontSize: 13, fontWeight: 700,
              letterSpacing: '0.02em', cursor: s.loading ? 'not-allowed' : 'pointer',
              textAlign: 'left',
            }}>
            {s.loading ? 'saving...' : 'save →'}
          </button>
          {note && (
            <button type="button" onClick={() => s.deleteNote({ onSuccess: () => router.refresh() })} disabled={s.loading}
              style={{
                padding: '10px 0',
                border: 'none', background: 'transparent',
                color: 'rgba(239,83,80,0.7)',
                fontFamily: MONO, fontSize: 12,
                cursor: 'pointer', letterSpacing: '0.02em',
              }}>delete</button>
          )}
        </div>
      </form>

      {!isNoWatch && (
        <div style={{ marginTop: 72, paddingTop: 32, borderTop: `1px solid ${FAINT}` }}>
          <div style={{
            fontSize: 10, fontFamily: MONO, color: MUTED,
            letterSpacing: '0.04em', marginBottom: 24,
          }}>player_ratings</div>
          <RatingPageView fixture={fixture} lineups={lineups} teamInfo={teamInfo} myRatings={myRatings} viewOnly={viewOnly} />
        </div>
      )}
    </div>
  )
}

// ────────── サブコンポーネント ──────────

function FieldRow({ label, children }) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontFamily: MONO, color: MUTED,
        letterSpacing: '0.04em', marginBottom: 10,
      }}>{label}</div>
      {children}
    </div>
  )
}

function TextOptions({ options, labels, value, onChange, clearable = false }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map((opt, i) => {
        const active = value === opt
        return (
          <span key={opt} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <button type="button" onClick={() => onChange(opt)}
              style={{
                padding: '4px 0',
                border: 'none', background: 'transparent',
                color: active ? WHITE : MUTED,
                fontFamily: 'inherit', fontSize: 14,
                fontWeight: active ? 700 : 400,
                cursor: 'pointer', letterSpacing: '0.01em',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
              {active && <Check size={11} strokeWidth={2.5} color="#00ff87" />}
              <span>{labels[opt]}</span>
            </button>
            {i < options.length - 1 && <span style={{ color: FAINT, fontSize: 11 }}>·</span>}
          </span>
        )
      })}
      {clearable && value && (
        <span style={{ color: FAINT, fontSize: 11, marginLeft: 6 }}>·</span>
      )}
      {clearable && value && (
        <button type="button" onClick={() => onChange('')}
          style={{
            padding: '4px 0', border: 'none', background: 'transparent',
            color: 'rgba(255,255,255,0.3)', fontSize: 11, cursor: 'pointer',
            fontFamily: MONO,
          }}>(clear)</button>
      )}
    </div>
  )
}

function ThinInput(props) {
  return (
    <input
      {...props}
      style={{
        width: '100%', padding: '6px 0',
        border: 'none', borderBottom: `1px solid ${FAINT}`,
        backgroundColor: 'transparent', color: WHITE,
        fontFamily: 'inherit', fontSize: 14,
        outline: 'none',
        ...(props.style ?? {}),
      }}
    />
  )
}

function ThinSelect({ children, style, ...props }) {
  return (
    <select
      {...props}
      style={{
        padding: '4px 18px 4px 0',
        border: 'none', borderBottom: `1px solid ${FAINT}`,
        backgroundColor: 'transparent', color: WHITE,
        fontFamily: 'inherit', fontSize: 14,
        appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
        outline: 'none',
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'><path d='M1 1l3 3 3-3' stroke='%23999' fill='none' stroke-width='1'/></svg>")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 2px center',
        ...style,
      }}
    >{children}</select>
  )
}

function FlashRow({ successFlash, error }) {
  if (!successFlash && !error) return null
  return (
    <div style={{
      fontSize: 11, fontFamily: MONO, padding: '8px 0',
      borderTop: `1px solid ${FAINT}`, borderBottom: `1px solid ${FAINT}`,
      color: error ? '#ef5350' : '#00ff87',
      letterSpacing: '0.02em',
    }}>{error ? `error: ${error}` : '✓ saved'}</div>
  )
}
