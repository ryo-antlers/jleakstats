'use client'
// Variant A: Editorial
//   - 雑誌組版・タイポグラフィ主役
//   - radio = テキストタブ (アンダーラインで active)
//   - timeline = ladder (左に巨大な時刻、右にエッセイ風テキスト)
//   - 配色 = 95% モノクローム + 細いグリーンライン
//   - フォント = system serif accents、numeric は tabular

import { useRouter } from 'next/navigation'
import { useWatchNoteState, WATCH_NOTE_LIMITS } from '@/app/notes/use-watch-note-state'
import { WATCH_TYPE_LABELS, ACCESS_LABELS, SEAT_TYPE_LABELS } from '@/app/notes/_shared'
import { PREFECTURES } from '@/lib/jp/prefectures'
import { municipalities } from '@/lib/jp/municipalities'
import RatingPageView from '@/app/rating/rating-view'

const SERIF = 'Georgia, "Hiragino Mincho ProN", "Yu Mincho", serif'

export default function VariantEditorial({ fixtureId, fixture, lineups, teamInfo, myRatings, viewOnly, note, isNoWatch }) {
  const router = useRouter()
  const s = useWatchNoteState(fixtureId, note)

  async function handleSubmit(e) {
    e.preventDefault()
    await s.save({ onSuccess: () => router.refresh() })
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingInline: 24 }}>
      {/* 大見出し */}
      <header style={{ borderBottom: '1px solid rgba(255,255,255,0.18)', paddingBottom: 14, marginBottom: 36 }}>
        <p style={{
          fontSize: 9, fontWeight: 800, letterSpacing: '0.32em',
          color: 'rgba(255,255,255,0.45)', margin: 0, textTransform: 'uppercase',
        }}>Editorial · Match Log No.{String(fixtureId).slice(-4)}</p>
        <h1 style={{
          margin: '8px 0 0', fontFamily: SERIF,
          fontSize: 38, fontWeight: 400, lineHeight: 1.05,
          color: '#fff', letterSpacing: '-0.01em',
        }}>Watch Note</h1>
      </header>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
        <Section label="観戦区分" number="01">
          <TabRow
            options={['stadium', 'dazn', 'tv', 'no_watch']}
            labels={WATCH_TYPE_LABELS}
            value={s.watchType}
            onChange={s.setWatchType}
          />
        </Section>

        {s.watchType === 'stadium' && (
          <>
            <Section label="アクセス" number="02">
              <TabRow
                options={['train', 'car', 'bus', 'walk', 'other']}
                labels={ACCESS_LABELS}
                value={s.access}
                onChange={v => s.setAccess(v === s.access ? '' : v)}
                small
              />
            </Section>

            <Section label="座席" number="03">
              <TabRow
                options={['goal_back', 'reserved']}
                labels={SEAT_TYPE_LABELS}
                value={s.seatType}
                onChange={v => s.setSeatType(v === s.seatType ? '' : v)}
              />
            </Section>

            <Section label="出発地" number="04">
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <Underlined>
                  <select
                    value={s.departurePrefecture}
                    onChange={e => { s.setDeparturePrefecture(e.target.value); s.setDepartureCity('') }}
                    style={editInputStyle}
                  >
                    <option value="">都道府県</option>
                    {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Underlined>
                <span style={{ fontFamily: SERIF, color: 'rgba(255,255,255,0.3)', fontSize: 22 }}>·</span>
                <Underlined>
                  <select
                    value={s.departureCity}
                    onChange={e => s.setDepartureCity(e.target.value)}
                    disabled={!s.departurePrefecture}
                    style={editInputStyle}
                  >
                    <option value="">{s.departurePrefecture ? '市区町村' : '—'}</option>
                    {(municipalities[s.departurePrefecture] ?? []).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Underlined>
              </div>
            </Section>
          </>
        )}

        <Section label="同行者" number={s.watchType === 'stadium' ? '05' : '02'}>
          <Underlined block>
            <input
              type="text"
              value={s.companion}
              onChange={e => s.setCompanion(e.target.value)}
              maxLength={WATCH_NOTE_LIMITS.COMPANION_MAX}
              placeholder="With whom?"
              style={{ ...editInputStyle, width: '100%' }}
            />
          </Underlined>
        </Section>

        <Section label="次回観戦時の備忘メモ" number={s.watchType === 'stadium' ? '06' : '03'}>
          <textarea
            value={s.nextVisitMemo}
            onChange={e => s.setNextVisitMemo(e.target.value)}
            maxLength={WATCH_NOTE_LIMITS.NEXT_VISIT_MEMO_MAX}
            rows={5}
            placeholder="Notes for your future self..."
            style={{
              width: '100%', resize: 'vertical',
              padding: '12px 0', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.15)',
              backgroundColor: 'transparent', color: '#fff',
              fontSize: 16, fontFamily: SERIF, lineHeight: 1.55,
              outline: 'none',
            }}
          />
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4, textAlign: 'right' }}>
            {[...s.nextVisitMemo].length}/{WATCH_NOTE_LIMITS.NEXT_VISIT_MEMO_MAX}
          </p>
        </Section>

        {/* タイムライン編集 */}
        <Section label="その日の記録" number={s.watchType === 'stadium' ? '07' : '04'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {s.timeline.length === 0 && (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: SERIF, fontStyle: 'italic' }}>
                Add notable moments — what you ate, what you bought, what you queued for.
              </p>
            )}
            {s.timeline.map((entry, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 14, alignItems: 'baseline', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 10 }}>
                <input
                  type="time"
                  value={entry.time}
                  onChange={e => s.updateTimelineEntry(idx, { time: e.target.value })}
                  style={{
                    flex: '0 0 90px', padding: 0, border: 'none',
                    backgroundColor: 'transparent', color: '#00ff87',
                    fontSize: 18, fontWeight: 700, letterSpacing: '0.04em',
                    fontVariantNumeric: 'tabular-nums', outline: 'none', fontFamily: 'inherit',
                  }}
                />
                <input
                  type="text"
                  value={entry.text}
                  onChange={e => s.updateTimelineEntry(idx, { text: e.target.value })}
                  maxLength={WATCH_NOTE_LIMITS.TIMELINE_TEXT_MAX}
                  placeholder="...what happened?"
                  style={{
                    flex: 1, padding: 0, border: 'none',
                    backgroundColor: 'transparent', color: '#fff',
                    fontSize: 15, fontFamily: SERIF, lineHeight: 1.5,
                    outline: 'none',
                  }}
                />
                <button type="button" onClick={() => s.removeTimelineEntry(idx)} aria-label="削除"
                  style={{ border: 'none', background: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 14, padding: 4 }}>×</button>
              </div>
            ))}
            <button type="button" onClick={s.addTimelineEntry}
              disabled={s.timeline.length >= WATCH_NOTE_LIMITS.TIMELINE_MAX_ENTRIES}
              style={{
                alignSelf: 'flex-start', padding: '8px 0',
                fontSize: 11, letterSpacing: '0.2em', fontWeight: 700,
                color: 'rgba(255,255,255,0.55)', background: 'transparent', border: 'none',
                borderBottom: '1px solid rgba(255,255,255,0.4)',
                cursor: 'pointer', textTransform: 'uppercase',
              }}>+ Add Entry</button>
          </div>

          {/* ladder プレビュー (時刻入りの行のみ) */}
          {s.timeline.some(e => e.time && e.text.trim()) && (
            <div style={{ marginTop: 36 }}>
              <p style={{
                fontSize: 9, letterSpacing: '0.32em', fontWeight: 800,
                color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase',
                marginBottom: 18,
              }}>The Day</p>
              <Ladder entries={s.timeline.filter(e => e.time && e.text.trim())} />
            </div>
          )}
        </Section>

        <FlashRow successFlash={s.successFlash} error={s.error} />

        <div style={{ display: 'flex', gap: 18, alignItems: 'center', paddingTop: 12 }}>
          <button type="submit" disabled={s.loading}
            style={{
              padding: '14px 28px', fontSize: 11, fontWeight: 800,
              letterSpacing: '0.24em', textTransform: 'uppercase',
              backgroundColor: s.loading ? 'rgba(255,255,255,0.15)' : '#fff',
              color: s.loading ? 'rgba(0,0,0,0.4)' : '#000',
              border: 'none', cursor: s.loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}>
            {s.loading ? 'Saving…' : 'Publish Note'}
          </button>
          {note && (
            <button type="button" onClick={() => s.deleteNote({ onSuccess: () => router.refresh() })} disabled={s.loading}
              style={{
                padding: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
                color: 'rgba(255,80,80,0.85)', background: 'transparent', border: 'none',
                borderBottom: '1px solid rgba(255,80,80,0.5)', cursor: 'pointer',
                textTransform: 'uppercase',
              }}>Delete</button>
          )}
        </div>
      </form>

      {!isNoWatch && (
        <div style={{ marginTop: 56, borderTop: '1px solid rgba(255,255,255,0.18)', paddingTop: 32 }}>
          <p style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.32em',
            color: 'rgba(255,255,255,0.45)', margin: 0, textTransform: 'uppercase',
          }}>Player Ratings</p>
          <h2 style={{
            margin: '8px 0 28px', fontFamily: SERIF,
            fontSize: 28, fontWeight: 400, color: '#fff', letterSpacing: '-0.01em',
          }}>By minute, by foot.</h2>
          <RatingPageView fixture={fixture} lineups={lineups} teamInfo={teamInfo} myRatings={myRatings} viewOnly={viewOnly} />
        </div>
      )}
    </div>
  )
}

// ────────── サブコンポーネント ──────────

function Section({ label, number, children }) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 18 }}>
        <span style={{
          fontFamily: SERIF, fontSize: 13, color: 'rgba(255,255,255,0.35)',
          fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em',
        }}>§ {number}</span>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.28em',
          color: '#fff', textTransform: 'uppercase',
        }}>{label}</span>
        <span style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
      </div>
      {children}
    </section>
  )
}

function TabRow({ options, labels, value, onChange, small = false }) {
  return (
    <div style={{ display: 'flex', gap: small ? 18 : 26, flexWrap: 'wrap' }}>
      {options.map(opt => {
        const active = value === opt
        return (
          <button key={opt} type="button" onClick={() => onChange(opt)}
            style={{
              padding: '6px 0',
              border: 'none', background: 'transparent',
              color: active ? '#fff' : 'rgba(255,255,255,0.5)',
              fontSize: small ? 13 : 15,
              fontWeight: active ? 700 : 400,
              fontFamily: SERIF,
              letterSpacing: '0.02em',
              cursor: 'pointer',
              borderBottom: active ? '1px solid #00ff87' : '1px solid transparent',
              transition: 'all 0.15s ease',
            }}>
            {labels[opt]}
          </button>
        )
      })}
    </div>
  )
}

function Underlined({ children, block = false }) {
  return (
    <span style={{
      display: block ? 'block' : 'inline-block',
      borderBottom: '1px solid rgba(255,255,255,0.25)',
    }}>{children}</span>
  )
}

function Ladder({ entries }) {
  const sorted = [...entries].sort((a, b) => a.time.localeCompare(b.time))
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {sorted.map((e, i) => (
        <li key={i} style={{
          display: 'grid',
          gridTemplateColumns: '120px 1fr',
          gap: 24, alignItems: 'baseline',
          paddingBlock: 14,
          borderBottom: i < sorted.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
        }}>
          <span style={{
            fontSize: 28, fontWeight: 300, fontFamily: SERIF,
            color: 'rgba(255,255,255,0.9)',
            fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
            textAlign: 'right',
          }}>{e.time}</span>
          <span style={{
            fontSize: 15, fontFamily: SERIF, lineHeight: 1.55,
            color: 'rgba(255,255,255,0.9)',
          }}>{e.text}</span>
        </li>
      ))}
    </ol>
  )
}

function FlashRow({ successFlash, error }) {
  if (!successFlash && !error) return null
  return (
    <div style={{
      padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.12)',
      fontSize: 11, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase',
      color: error ? '#ef5350' : '#00ff87',
    }}>{error ?? '✓ Saved'}</div>
  )
}

const editInputStyle = {
  border: 'none', backgroundColor: 'transparent',
  color: '#fff', fontFamily: SERIF, fontSize: 15,
  padding: '6px 0', outline: 'none', appearance: 'none',
  WebkitAppearance: 'none', MozAppearance: 'none',
}
