'use client'
// /rating/[id]?paper=1 用の紙カードビュー
//   - 各セクションが「白い紙の付箋」として stack される
//   - 各カードの上端にクラブカラーのタブ (前面 = z-index で紙の上)
//   - カードは左右に交互ステッガー
//   - 紙エリアは純白の単色、選択肢のみを載せる
//   - 選択中の表現は色変更なし、下線のみ

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useWatchNoteState, WATCH_NOTE_LIMITS } from '@/app/notes/use-watch-note-state'
import { WATCH_TYPE_LABELS, ACCESS_LABELS, SEAT_TYPE_LABELS } from '@/app/notes/_shared'
import { PREFECTURES } from '@/lib/jp/prefectures'
import { municipalities } from '@/lib/jp/municipalities'
import RatingPageView from '@/app/rating/rating-view'
import { Plus, X } from 'lucide-react'

const PAPER     = '#ffffff'
const INK       = '#1c1c1c'
const INK_MUTED = '#7c7c7c'
const HAIRLINE  = '#dcdcdc'

function normalizeColor(raw) {
  if (!raw) return '#cc0033'
  const v = String(raw).trim()
  return v.startsWith('#') ? v : `#${v}`
}
function textOn(hex) {
  const h = (hex ?? '').replace('#', '')
  if (h.length < 6) return '#fff'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? '#fff' : '#000'
}

export default function PaperView({ fixtureId, fixture, lineups, teamInfo, myRatings, viewOnly, note, isNoWatch }) {
  const router = useRouter()
  const s = useWatchNoteState(fixtureId, note)
  const clubColor = normalizeColor(teamInfo?.color)
  const tabInk = textOn(clubColor)

  async function handleSave() {
    await s.save({ onSuccess: () => router.refresh() })
  }
  async function handleDelete() {
    await s.deleteNote({ onSuccess: () => router.refresh() })
  }

  return (
    <div style={{ paddingTop: 16, paddingBottom: 80, paddingInline: 14 }}>
      <ScoreHeader fixture={fixture} />

      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <Link href={`/rating/${fixtureId}`} style={{
          fontSize: 10, color: 'rgba(255,255,255,0.4)',
          letterSpacing: '0.12em', textDecoration: 'none',
        }}>通常モードに戻る ▸</Link>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 38 }}>
        <PaperCard side="left" tabColor={clubColor} tabInk={tabInk} tabLabel="観戦区分">
          <Choices
            options={['stadium', 'dazn', 'tv', 'no_watch']}
            labels={WATCH_TYPE_LABELS}
            value={s.watchType}
            onChange={s.setWatchType}
          />
        </PaperCard>

        {s.watchType === 'stadium' && (
          <>
            <PaperCard side="right" tabColor={clubColor} tabInk={tabInk} tabLabel="アクセス">
              <Choices
                options={['train', 'car', 'bus', 'walk', 'other']}
                labels={ACCESS_LABELS}
                value={s.access}
                onChange={v => s.setAccess(v === s.access ? '' : v)}
                clearable
              />
            </PaperCard>

            <PaperCard side="left" tabColor={clubColor} tabInk={tabInk} tabLabel="座席">
              <Choices
                options={['goal_back', 'reserved']}
                labels={SEAT_TYPE_LABELS}
                value={s.seatType}
                onChange={v => s.setSeatType(v === s.seatType ? '' : v)}
                clearable
              />
            </PaperCard>

            <PaperCard side="right" tabColor={clubColor} tabInk={tabInk} tabLabel="出発地">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <PaperSelect
                  value={s.departurePrefecture}
                  onChange={e => { s.setDeparturePrefecture(e.target.value); s.setDepartureCity('') }}
                  style={{ flex: '1 1 140px', minWidth: 130 }}
                >
                  <option value="">— 都道府県 —</option>
                  {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
                </PaperSelect>
                <PaperSelect
                  value={s.departureCity}
                  onChange={e => s.setDepartureCity(e.target.value)}
                  disabled={!s.departurePrefecture}
                  style={{ flex: '2 1 180px', minWidth: 160 }}
                >
                  <option value="">{s.departurePrefecture ? '— 市区町村 —' : '都道府県を選択'}</option>
                  {(municipalities[s.departurePrefecture] ?? []).map(c => <option key={c} value={c}>{c}</option>)}
                </PaperSelect>
              </div>
            </PaperCard>
          </>
        )}

        <PaperCard side="left" tabColor={clubColor} tabInk={tabInk} tabLabel="同行者">
          <PaperInput
            type="text"
            value={s.companion}
            onChange={e => s.setCompanion(e.target.value)}
            maxLength={WATCH_NOTE_LIMITS.COMPANION_MAX}
            placeholder="例: ゴール裏の仲間と / ひとり"
          />
        </PaperCard>

        <PaperCard side="right" tabColor={clubColor} tabInk={tabInk} tabLabel="次回への一言">
          <textarea
            value={s.nextVisitMemo}
            onChange={e => s.setNextVisitMemo(e.target.value)}
            maxLength={WATCH_NOTE_LIMITS.NEXT_VISIT_MEMO_MAX}
            placeholder="駐車場満車だった、コンビニで弁当買い忘れた…"
            rows={5}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: 0, paddingBottom: 6,
              fontSize: 14, lineHeight: 1.65, color: INK,
              backgroundColor: 'transparent',
              border: 'none', borderBottom: `1px solid ${HAIRLINE}`,
              outline: 'none', resize: 'vertical', minHeight: 90,
              fontFamily: 'inherit',
            }}
          />
        </PaperCard>

        <PaperCard side="left" tabColor={clubColor} tabInk={tabInk} tabLabel="タイムライン">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {s.timeline.map((entry, idx) => (
              <div key={idx} style={{
                display: 'flex', gap: 10, alignItems: 'center',
                paddingBottom: 6, borderBottom: `1px dashed ${HAIRLINE}`,
              }}>
                <input
                  type="time"
                  value={entry.time}
                  onChange={e => s.updateTimelineEntry(idx, { time: e.target.value })}
                  style={{
                    width: 96, padding: '4px 0',
                    color: INK, backgroundColor: 'transparent',
                    border: 'none', outline: 'none',
                    fontSize: 14, fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em',
                    fontFamily: 'inherit',
                  }}
                />
                <input
                  type="text"
                  value={entry.text}
                  onChange={e => s.updateTimelineEntry(idx, { text: e.target.value })}
                  maxLength={WATCH_NOTE_LIMITS.TIMELINE_TEXT_MAX}
                  placeholder="例: 牛串とビール"
                  style={{
                    flex: 1, minWidth: 0,
                    padding: '4px 0',
                    color: INK, backgroundColor: 'transparent',
                    border: 'none', outline: 'none',
                    fontSize: 14, fontFamily: 'inherit',
                  }}
                />
                <button
                  type="button"
                  onClick={() => s.removeTimelineEntry(idx)}
                  aria-label="削除"
                  style={{
                    width: 24, height: 24, padding: 0,
                    background: 'transparent', border: 'none',
                    color: INK_MUTED, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}
                ><X size={14} strokeWidth={1.8} /></button>
              </div>
            ))}
            <button
              type="button"
              onClick={s.addTimelineEntry}
              disabled={s.timeline.length >= WATCH_NOTE_LIMITS.TIMELINE_MAX_ENTRIES}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                alignSelf: 'flex-start',
                padding: '6px 0',
                color: INK, fontSize: 13, fontWeight: 700,
                backgroundColor: 'transparent',
                border: 'none',
                borderBottom: `1px solid ${INK}`,
                cursor: s.timeline.length >= WATCH_NOTE_LIMITS.TIMELINE_MAX_ENTRIES ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}>
              <Plus size={13} strokeWidth={2} /> 追加
            </button>
          </div>
        </PaperCard>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          flexWrap: 'wrap', marginTop: 8, paddingInline: 4,
        }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={s.loading}
            style={{
              padding: '13px 26px', fontSize: 11, fontWeight: 900,
              letterSpacing: '0.22em', textTransform: 'uppercase',
              color: tabInk,
              backgroundColor: s.loading ? `${clubColor}88` : clubColor,
              border: 'none', cursor: s.loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              boxShadow: '0 3px 0 rgba(0,0,0,0.4)',
              transform: s.loading ? 'translateY(2px)' : 'translateY(0)',
              transition: 'transform 0.1s ease',
            }}>{s.loading ? 'Saving…' : 'Save'}</button>
          {note && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={s.loading}
              style={{
                padding: '12px 18px', fontSize: 10, fontWeight: 800,
                letterSpacing: '0.18em', textTransform: 'uppercase',
                color: '#ef5350', backgroundColor: 'transparent',
                border: '1px solid #ef535055', cursor: 'pointer',
                fontFamily: 'inherit',
              }}>Delete</button>
          )}
          {s.successFlash && (
            <span style={{
              fontSize: 11, letterSpacing: '0.18em', fontWeight: 800,
              color: '#00ff87', textTransform: 'uppercase',
            }}>✓ Saved</span>
          )}
          {s.error && (
            <span style={{
              fontSize: 11, letterSpacing: '0.12em', fontWeight: 700,
              color: '#ef5350',
            }}>{s.error}</span>
          )}
        </div>

        {!isNoWatch && (
          <div style={{ marginTop: 26 }}>
            <RatingPageView
              fixture={fixture}
              lineups={lineups}
              teamInfo={teamInfo}
              myRatings={myRatings}
              viewOnly={viewOnly}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────── 紙カード ───────────

function PaperCard({ side = 'left', tabColor, tabInk, tabLabel, children }) {
  const stagger = 30
  const wrapStyle = side === 'left'
    ? { marginRight: stagger }
    : { marginLeft: stagger }
  const tabLeft  = side === 'left' ? '28%' : 'auto'
  const tabRight = side === 'left' ? 'auto' : '28%'

  return (
    <div style={{ position: 'relative', ...wrapStyle }}>
      {/* 紙本体 (奥) */}
      <div style={{
        position: 'relative', zIndex: 1,
        backgroundColor: PAPER,
        color: INK,
        padding: '34px 22px 26px',
      }}>{children}</div>

      {/* タブ (前面 = z-index 2、紙の上に重ねる) */}
      <div style={{
        position: 'absolute',
        top: -10,
        left: tabLeft,
        right: tabRight,
        minWidth: 120,
        maxWidth: 200,
        padding: '7px 16px 8px',
        backgroundColor: tabColor,
        color: tabInk,
        fontSize: 10, fontWeight: 900,
        letterSpacing: '0.18em', textTransform: 'uppercase',
        textAlign: 'center',
        zIndex: 2,
        display: 'inline-block',
      }}>{tabLabel}</div>
    </div>
  )
}

// ─────────── 選択肢 (テキストのみ、active = 下線) ───────────

function Choices({ options, labels, value, onChange, clearable = false }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 24px' }}>
      {options.map(opt => {
        const active = value === opt
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            style={{
              padding: '4px 0',
              color: INK,
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 15,
              fontWeight: active ? 700 : 500,
              letterSpacing: '0.02em',
              textDecoration: active ? 'underline' : 'none',
              textDecorationThickness: 2,
              textUnderlineOffset: 5,
            }}
          >{labels[opt]}</button>
        )
      })}
      {clearable && value && (
        <button
          type="button"
          onClick={() => onChange('')}
          style={{
            padding: '4px 0',
            color: INK_MUTED,
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 12,
            letterSpacing: '0.02em',
          }}
        >(clear)</button>
      )}
    </div>
  )
}

// ─────────── 紙の上のインプット ───────────

function PaperInput(props) {
  return (
    <input
      {...props}
      style={{
        width: '100%', boxSizing: 'border-box',
        padding: '6px 0', fontSize: 15,
        color: INK, backgroundColor: 'transparent',
        border: 'none', borderBottom: `1px solid ${HAIRLINE}`,
        outline: 'none', fontFamily: 'inherit',
        ...(props.style ?? {}),
      }}
    />
  )
}

function PaperSelect({ children, style, ...props }) {
  return (
    <select
      {...props}
      style={{
        padding: '8px 28px 8px 10px',
        fontSize: 14, color: INK,
        backgroundColor: '#fff',
        border: `1px solid ${HAIRLINE}`,
        outline: 'none',
        appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' stroke='%23999' fill='none' stroke-width='1.4'/></svg>")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
        fontFamily: 'inherit',
        ...style,
      }}
    >{children}</select>
  )
}

// ─────────── スコアヘッダー ───────────

function ScoreHeader({ fixture }) {
  const homeColor = normalizeColor(fixture.home_color)
  const awayColor = normalizeColor(fixture.away_color)
  const isPK = fixture.status === 'PEN' && fixture.home_penalty != null
  return (
    <div style={{ maxWidth: 560, margin: '0 auto 20px' }}>
      <div style={{ display: 'flex', marginBottom: 10, alignItems: 'center' }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
            {fixture.home_name ?? fixture.home_short ?? '-'}
          </span>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
            {fixture.away_name ?? fixture.away_short ?? '-'}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex' }}>
        <div style={{ flex: 1, height: 48, backgroundColor: homeColor, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span style={{ fontSize: 26, fontWeight: 900, color: textOn(homeColor), lineHeight: 1 }}>{fixture.home_score ?? 0}</span>
          {isPK && <span style={{ fontSize: 12, fontWeight: 900, color: textOn(homeColor), opacity: 0.7 }}>({fixture.home_penalty})</span>}
        </div>
        <div style={{ flex: 1, height: 48, backgroundColor: awayColor, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          {isPK && <span style={{ fontSize: 12, fontWeight: 900, color: textOn(awayColor), opacity: 0.7 }}>({fixture.away_penalty})</span>}
          <span style={{ fontSize: 26, fontWeight: 900, color: textOn(awayColor), lineHeight: 1 }}>{fixture.away_score ?? 0}</span>
        </div>
      </div>
    </div>
  )
}
