'use client'
// Variant B: Neon Stadium
//   - 電光掲示板・ネオン・ピル多用
//   - radio = グロウピル (active 時に強い発光)
//   - timeline = ティッカーテープ (横スクロール、緑グロウドット trail)
//   - 配色 = 強いグリーン (#00ff87) + 黒グラデ + うっすらノイズ
//   - フォント = sans, 数字は monospaced

import { useRouter } from 'next/navigation'
import { useWatchNoteState, WATCH_NOTE_LIMITS } from '@/app/notes/use-watch-note-state'
import {
  WATCH_TYPE_LABELS, WATCH_TYPE_ICONS,
  ACCESS_LABELS, ACCESS_ICONS,
  SEAT_TYPE_LABELS, SEAT_TYPE_ICONS,
} from '@/app/notes/_shared'
import { PREFECTURES } from '@/lib/jp/prefectures'
import { municipalities } from '@/lib/jp/municipalities'
import RatingPageView from '@/app/rating/rating-view'

const GREEN = '#00ff87'
const MONO = 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace'

export default function VariantNeon({ fixtureId, fixture, lineups, teamInfo, myRatings, viewOnly, note, isNoWatch }) {
  const router = useRouter()
  const s = useWatchNoteState(fixtureId, note)

  async function handleSubmit(e) {
    e.preventDefault()
    await s.save({ onSuccess: () => router.refresh() })
  }

  return (
    <div style={{
      maxWidth: 620, margin: '0 auto', paddingInline: 14,
      backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(0,255,135,0.06), transparent 50%)',
    }}>
      {/* 大型ネオンタイトル */}
      <header style={{ textAlign: 'center', marginBottom: 32, paddingTop: 6 }}>
        <NeonBadge>LIVE FROM THE STAND</NeonBadge>
        <h1 style={{
          margin: '14px 0 0',
          fontSize: 30, fontWeight: 900, letterSpacing: '0.12em',
          color: GREEN, textTransform: 'uppercase',
          textShadow: `0 0 12px ${GREEN}55, 0 0 30px ${GREEN}33`,
        }}>WATCH NOTE</h1>
      </header>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <NeonSection title="観戦区分">
          <PillRow
            options={['stadium', 'dazn', 'tv', 'no_watch']}
            labels={WATCH_TYPE_LABELS}
            icons={WATCH_TYPE_ICONS}
            value={s.watchType}
            onChange={s.setWatchType}
            cols={4}
          />
        </NeonSection>

        {s.watchType === 'stadium' && (
          <>
            <NeonSection title="アクセス手段">
              <PillRow
                options={['train', 'car', 'bus', 'walk', 'other']}
                labels={ACCESS_LABELS}
                icons={ACCESS_ICONS}
                value={s.access}
                onChange={v => s.setAccess(v === s.access ? '' : v)}
                cols={5}
                compact
              />
            </NeonSection>

            <NeonSection title="座席">
              <PillRow
                options={['goal_back', 'reserved']}
                labels={SEAT_TYPE_LABELS}
                icons={SEAT_TYPE_ICONS}
                value={s.seatType}
                onChange={v => s.setSeatType(v === s.seatType ? '' : v)}
                cols={2}
              />
            </NeonSection>

            <NeonSection title="出発地">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <NeonSelect
                  value={s.departurePrefecture}
                  onChange={e => { s.setDeparturePrefecture(e.target.value); s.setDepartureCity('') }}
                  style={{ flex: '1 1 130px', minWidth: 120 }}
                >
                  <option value="">— 都道府県 —</option>
                  {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
                </NeonSelect>
                <NeonSelect
                  value={s.departureCity}
                  onChange={e => s.setDepartureCity(e.target.value)}
                  disabled={!s.departurePrefecture}
                  style={{ flex: '2 1 180px', minWidth: 140 }}
                >
                  <option value="">{s.departurePrefecture ? '— 市区町村 —' : '都道府県 →'}</option>
                  {(municipalities[s.departurePrefecture] ?? []).map(c => <option key={c} value={c}>{c}</option>)}
                </NeonSelect>
              </div>
            </NeonSection>
          </>
        )}

        <NeonSection title="同行者">
          <NeonInput
            type="text"
            value={s.companion}
            onChange={e => s.setCompanion(e.target.value)}
            maxLength={WATCH_NOTE_LIMITS.COMPANION_MAX}
            placeholder="ゴール裏の仲間と / ひとり"
          />
        </NeonSection>

        <NeonSection title="次回観戦時の備忘メモ">
          <textarea
            value={s.nextVisitMemo}
            onChange={e => s.setNextVisitMemo(e.target.value)}
            maxLength={WATCH_NOTE_LIMITS.NEXT_VISIT_MEMO_MAX}
            placeholder="次の自分へのヒント…"
            rows={4}
            style={{
              width: '100%', resize: 'vertical', minHeight: 90,
              padding: '12px 14px', fontSize: 13, lineHeight: 1.6,
              color: '#fff', backgroundColor: 'rgba(0,255,135,0.04)',
              border: `1px solid ${GREEN}33`, outline: 'none',
              fontFamily: 'inherit', borderRadius: 4,
              boxShadow: `inset 0 0 12px rgba(0,255,135,0.04)`,
            }}
            onFocus={e => e.target.style.borderColor = GREEN}
            onBlur={e => e.target.style.borderColor = `${GREEN}33`}
          />
        </NeonSection>

        {/* タイムライン */}
        <NeonSection title="1 日のタイムライン">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {s.timeline.map((entry, idx) => (
              <div key={idx} style={{
                display: 'flex', gap: 8, alignItems: 'center',
                padding: '8px 10px', borderRadius: 6,
                border: `1px solid ${GREEN}22`,
                backgroundColor: 'rgba(0,255,135,0.03)',
              }}>
                <input
                  type="time"
                  value={entry.time}
                  onChange={e => s.updateTimelineEntry(idx, { time: e.target.value })}
                  style={{
                    width: 90, padding: '6px 8px', borderRadius: 4,
                    border: `1px solid ${GREEN}44`, backgroundColor: '#000',
                    color: GREEN, fontFamily: MONO, fontSize: 13,
                    fontWeight: 700, letterSpacing: '0.04em',
                    outline: 'none',
                  }}
                />
                <input
                  type="text"
                  value={entry.text}
                  onChange={e => s.updateTimelineEntry(idx, { text: e.target.value })}
                  maxLength={WATCH_NOTE_LIMITS.TIMELINE_TEXT_MAX}
                  placeholder="ビール / 牛串 / グッズに並ぶ"
                  style={{
                    flex: 1, minWidth: 0,
                    padding: '6px 10px', borderRadius: 4,
                    border: 'none', backgroundColor: 'rgba(255,255,255,0.04)',
                    color: '#fff', fontFamily: 'inherit', fontSize: 13,
                    outline: 'none',
                  }}
                />
                <button type="button" onClick={() => s.removeTimelineEntry(idx)} aria-label="削除"
                  style={{
                    width: 26, height: 26, border: 'none', borderRadius: '50%',
                    background: 'transparent', color: 'rgba(255,255,255,0.4)',
                    cursor: 'pointer', fontSize: 14,
                  }}>×</button>
              </div>
            ))}
            <button type="button" onClick={s.addTimelineEntry}
              disabled={s.timeline.length >= WATCH_NOTE_LIMITS.TIMELINE_MAX_ENTRIES}
              style={{
                padding: '10px 14px', borderRadius: 4,
                border: `1px dashed ${GREEN}55`, backgroundColor: 'transparent',
                color: GREEN, fontWeight: 800, letterSpacing: '0.16em', fontSize: 11,
                cursor: 'pointer', fontFamily: 'inherit',
                textTransform: 'uppercase',
              }}>+ Add</button>
          </div>

          {/* ティッカープレビュー */}
          {s.timeline.some(e => e.time && e.text.trim()) && (
            <div style={{ marginTop: 22 }}>
              <NeonBadge small>Ticker Preview</NeonBadge>
              <NeonTicker entries={s.timeline.filter(e => e.time && e.text.trim())} />
            </div>
          )}
        </NeonSection>

        <FlashRow successFlash={s.successFlash} error={s.error} />

        <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
          <button type="submit" disabled={s.loading}
            style={{
              flex: 1, padding: '14px 20px', borderRadius: 4,
              backgroundColor: s.loading ? `${GREEN}33` : GREEN,
              color: '#000', fontWeight: 900, fontSize: 12,
              letterSpacing: '0.24em', textTransform: 'uppercase',
              border: 'none', cursor: s.loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              boxShadow: s.loading ? 'none' : `0 0 24px ${GREEN}55`,
              transition: 'all 0.2s ease',
            }}>
            {s.loading ? 'Transmitting…' : '▶ Broadcast'}
          </button>
          {note && (
            <button type="button" onClick={() => s.deleteNote({ onSuccess: () => router.refresh() })} disabled={s.loading}
              style={{
                padding: '14px 18px', borderRadius: 4,
                backgroundColor: 'transparent', color: '#ef5350',
                fontWeight: 800, fontSize: 11, letterSpacing: '0.18em',
                border: '1px solid #ef535066', cursor: 'pointer',
                textTransform: 'uppercase', fontFamily: 'inherit',
              }}>Delete</button>
          )}
        </div>
      </form>

      {!isNoWatch && (
        <div style={{ marginTop: 40 }}>
          <header style={{ textAlign: 'center', marginBottom: 14 }}>
            <NeonBadge>Player Ratings</NeonBadge>
          </header>
          <div style={{
            padding: 0, borderRadius: 6,
            border: `1px solid ${GREEN}22`,
            backgroundColor: 'rgba(0,255,135,0.02)',
            boxShadow: `inset 0 0 30px rgba(0,255,135,0.03)`,
          }}>
            <RatingPageView fixture={fixture} lineups={lineups} teamInfo={teamInfo} myRatings={myRatings} viewOnly={viewOnly} />
          </div>
        </div>
      )}
    </div>
  )
}

// ────────── ネオン用サブコンポーネント ──────────

function NeonBadge({ children, small = false }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: small ? '3px 10px' : '5px 14px',
      borderRadius: 999,
      border: `1px solid ${GREEN}66`,
      backgroundColor: `${GREEN}11`,
      color: GREEN, fontWeight: 800,
      fontSize: small ? 9 : 10,
      letterSpacing: '0.24em', textTransform: 'uppercase',
      boxShadow: `0 0 16px ${GREEN}22`,
    }}>{children}</span>
  )
}

function NeonSection({ title, children }) {
  return (
    <section>
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.24em',
        color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase',
        marginBottom: 10,
      }}>{title}</div>
      {children}
    </section>
  )
}

function PillRow({ options, labels, icons, value, onChange, cols, compact = false }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6 }}>
      {options.map(opt => {
        const active = value === opt
        const Icon = icons[opt]
        return (
          <button key={opt} type="button" onClick={() => onChange(opt)}
            style={{
              padding: compact ? '10px 6px' : '12px 6px',
              borderRadius: 999,
              border: active ? `1px solid ${GREEN}` : `1px solid ${GREEN}33`,
              backgroundColor: active ? `${GREEN}22` : 'rgba(0,0,0,0.4)',
              color: active ? GREEN : 'rgba(255,255,255,0.7)',
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              fontSize: compact ? 10 : 11, fontWeight: active ? 800 : 600,
              letterSpacing: '0.06em',
              boxShadow: active ? `0 0 14px ${GREEN}55, inset 0 0 12px ${GREEN}22` : 'none',
              transition: 'all 0.18s ease',
            }}>
            {Icon ? <Icon size={compact ? 16 : 18} strokeWidth={1.8} /> : null}
            <span>{labels[opt]}</span>
          </button>
        )
      })}
    </div>
  )
}

function NeonInput(props) {
  return (
    <input
      {...props}
      style={{
        width: '100%', padding: '12px 14px', borderRadius: 4,
        backgroundColor: 'rgba(0,255,135,0.04)', color: '#fff',
        border: `1px solid ${GREEN}33`, outline: 'none',
        fontSize: 14, fontFamily: 'inherit',
        boxSizing: 'border-box',
        ...(props.style ?? {}),
      }}
      onFocus={e => e.target.style.borderColor = GREEN}
      onBlur={e => e.target.style.borderColor = `${GREEN}33`}
    />
  )
}

function NeonSelect({ style, children, ...props }) {
  return (
    <select
      {...props}
      style={{
        padding: '10px 28px 10px 12px', fontSize: 13,
        backgroundColor: '#000', color: '#fff',
        border: `1px solid ${GREEN}44`, outline: 'none',
        appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' stroke='%2300ff87' fill='none' stroke-width='1.6'/></svg>")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
        fontFamily: 'inherit', borderRadius: 4,
        ...style,
      }}
    >{children}</select>
  )
}

function NeonTicker({ entries }) {
  const sorted = [...entries].sort((a, b) => a.time.localeCompare(b.time))
  return (
    <div style={{
      display: 'flex', gap: 0,
      overflowX: 'auto', paddingBlock: 12, paddingInline: 2,
      scrollbarWidth: 'thin',
    }}>
      {sorted.map((e, i) => (
        <div key={i} style={{
          flex: '0 0 auto', minWidth: 130,
          padding: '10px 16px 10px 14px',
          position: 'relative',
          borderRight: i < sorted.length - 1 ? `1px dashed ${GREEN}33` : 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              backgroundColor: GREEN,
              boxShadow: `0 0 8px ${GREEN}, 0 0 16px ${GREEN}66`,
            }} />
            <span style={{
              fontFamily: MONO, fontSize: 12, fontWeight: 700,
              color: GREEN, letterSpacing: '0.04em',
            }}>{e.time}</span>
          </div>
          <div style={{
            fontSize: 12, color: 'rgba(255,255,255,0.9)',
            lineHeight: 1.45, maxWidth: 200,
          }}>{e.text}</div>
        </div>
      ))}
    </div>
  )
}

function FlashRow({ successFlash, error }) {
  if (!successFlash && !error) return null
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 4,
      backgroundColor: error ? 'rgba(239,83,80,0.1)' : `${GREEN}11`,
      border: error ? '1px solid #ef5350' : `1px solid ${GREEN}`,
      color: error ? '#ef5350' : GREEN,
      fontSize: 11, fontWeight: 800, letterSpacing: '0.16em',
      textTransform: 'uppercase',
    }}>{error ?? '✓ TRANSMITTED'}</div>
  )
}
