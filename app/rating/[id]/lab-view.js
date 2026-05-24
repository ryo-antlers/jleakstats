'use client'
// /rating/[id] のデザインラボ
//   - 上部に 1-5 のピル切替
//   - 5 種類のレイアウト・タイムライン表示・観戦区分入力をプリセットしたバリアントを切替
//   - URL の ?lab=N と同期 (シェア・ブックマーク可)
//
// NOTE: 採点 UI (RatingPageView) は内部構造が複雑なので、v1 ではラッパー側だけ変える。
//       気に入ったバリアントが決まったら採点 UI も個別に深堀り。

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import NoteForm from '@/app/notes/[fixture_id]/note-form'
import RatingPageView from '@/app/rating/rating-view'

const VARIANTS = [
  { n: 1, label: '1', name: 'Control',         desc: '現状そのまま (1 列・縦線タイムライン・採点ドーナツ)' },
  { n: 2, label: '2', name: 'Compact',         desc: '2 列カード・チャットバブルタイムライン・コンパクトラジオ' },
  { n: 3, label: '3', name: '3-Col Hero',      desc: 'デスクトップ 3 列・カードグリッドタイムライン' },
  { n: 4, label: '4', name: 'Timeline-First',  desc: 'タイムライン主役 (横スクロール) + 観戦ノート折りたたみ風' },
  { n: 5, label: '5', name: 'Mobile Cards',    desc: '大きな縦カード・ナンバリングタイムライン' },
]

function normalizeColor(raw) {
  if (!raw) return '#444'
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

export default function RatingLabView({
  fixtureId, fixture, lineups, teamInfo, myRatings, viewOnly, note, isNoWatch, initialVariant = 1,
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [variant, setVariant] = useState(initialVariant)

  // URL の ?lab=N を state と同期 (履歴汚さず replace)
  useEffect(() => {
    const current = Number(searchParams.get('lab')) || 1
    if (current !== variant) {
      const sp = new URLSearchParams(searchParams.toString())
      sp.set('lab', String(variant))
      router.replace(`?${sp.toString()}`, { scroll: false })
    }
  }, [variant, router, searchParams])

  const homeColor = normalizeColor(fixture.home_color)
  const awayColor = normalizeColor(fixture.away_color)
  const isPK = fixture.status === 'PEN' && fixture.home_penalty != null

  const sharedProps = {
    fixtureId, fixture, lineups, teamInfo, myRatings, viewOnly,
    note, isNoWatch, homeColor, awayColor, isPK,
  }

  return (
    <div style={{ paddingTop: 18, paddingBottom: 80 }}>
      {/* バリアント切替バー */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        backgroundColor: 'rgba(10,10,10,0.94)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        padding: '10px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        marginBottom: 20,
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 9, fontWeight: 900, letterSpacing: '0.22em',
            color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase',
          }}>Design Lab</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {VARIANTS.map(v => (
              <button
                key={v.n}
                onClick={() => setVariant(v.n)}
                title={`${v.name} — ${v.desc}`}
                style={{
                  width: 30, height: 30, borderRadius: 999,
                  border: variant === v.n ? '1px solid #00ff87' : '1px solid rgba(255,255,255,0.18)',
                  backgroundColor: variant === v.n ? 'rgba(0,255,135,0.15)' : 'transparent',
                  color: variant === v.n ? '#00ff87' : 'rgba(255,255,255,0.75)',
                  fontWeight: 800, fontSize: 12, fontFamily: 'inherit',
                  cursor: 'pointer', display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.12s ease',
                }}
              >{v.label}</button>
            ))}
          </div>
          <span style={{
            fontSize: 11, color: 'rgba(255,255,255,0.6)',
            fontWeight: 600, letterSpacing: '0.02em',
          }}>{VARIANTS[variant - 1]?.name}</span>
          <Link href={`/rating/${fixtureId}`} style={{
            marginLeft: 'auto', fontSize: 10,
            color: 'rgba(255,255,255,0.45)', textDecoration: 'none',
            letterSpacing: '0.08em',
          }}>ラボ終了 ▸</Link>
        </div>
        <div style={{
          maxWidth: 1100, margin: '6px auto 0',
          fontSize: 10, color: 'rgba(255,255,255,0.4)',
        }}>{VARIANTS[variant - 1]?.desc}</div>
      </div>

      {/* スコアヘッダー (全バリアント共通) */}
      <ScoreHeader fixture={fixture} homeColor={homeColor} awayColor={awayColor} isPK={isPK} />

      {/* バリアント切替 */}
      {variant === 1 && <V1Control     {...sharedProps} />}
      {variant === 2 && <V2Compact     {...sharedProps} />}
      {variant === 3 && <V3ThreeCol    {...sharedProps} />}
      {variant === 4 && <V4TimelineFirst {...sharedProps} />}
      {variant === 5 && <V5MobileCards {...sharedProps} />}
    </div>
  )
}

// ───────────────────────────────────────
// スコアヘッダー (共通)
// ───────────────────────────────────────
function ScoreHeader({ fixture, homeColor, awayColor, isPK }) {
  return (
    <div style={{ maxWidth: 560, margin: '0 auto 24px' }}>
      <div style={{ display: 'flex', marginBottom: 12, alignItems: 'center' }}>
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

// ───────────────────────────────────────
// 共通の WATCH NOTE 見出し
// ───────────────────────────────────────
function WatchNoteHeading({ align = 'center', size = 11 }) {
  return (
    <p style={{
      fontSize: size, fontWeight: 700, letterSpacing: '0.2em',
      color: 'rgba(255,255,255,0.4)', margin: '14px 0 16px',
      textAlign: align,
    }}>WATCH NOTE</p>
  )
}

function CardWrap({ children, padding = '18px 18px 22px' }) {
  return (
    <div style={{
      padding,
      border: '1px solid rgba(255,255,255,0.08)',
      backgroundColor: 'rgba(255,255,255,0.02)',
    }}>{children}</div>
  )
}

// ───────────────────────────────────────
// V1: 現状そのまま (control)
// ───────────────────────────────────────
function V1Control({ fixtureId, fixture, lineups, teamInfo, myRatings, viewOnly, note, isNoWatch }) {
  return (
    <>
      <section style={{
        maxWidth: 560, margin: '0 auto 24px',
        paddingTop: 18, borderTop: '1px solid #1a1a1a',
      }}>
        <WatchNoteHeading />
        <NoteForm
          fixtureId={fixtureId}
          initialNote={note}
          afterSaveMode="refresh"
          layoutMode="default"
          timelineMode="vertical"
        />
      </section>
      {!isNoWatch && (
        <RatingPageView
          fixture={fixture}
          lineups={lineups}
          teamInfo={teamInfo}
          myRatings={myRatings}
          viewOnly={viewOnly}
        />
      )}
    </>
  )
}

// ───────────────────────────────────────
// V2: コンパクト (radio 2-3 列、TL = bubble)
// ───────────────────────────────────────
function V2Compact({ fixtureId, fixture, lineups, teamInfo, myRatings, viewOnly, note, isNoWatch }) {
  return (
    <>
      <section style={{ maxWidth: 520, margin: '0 auto 24px', paddingTop: 14 }}>
        <WatchNoteHeading />
        <CardWrap padding="16px 14px 20px">
          <NoteForm
            fixtureId={fixtureId}
            initialNote={note}
            afterSaveMode="refresh"
            layoutMode="compact"
            timelineMode="bubble"
          />
        </CardWrap>
      </section>
      {!isNoWatch && (
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <RatingPageView fixture={fixture} lineups={lineups} teamInfo={teamInfo} myRatings={myRatings} viewOnly={viewOnly} />
        </div>
      )}
    </>
  )
}

// ───────────────────────────────────────
// V3: デスクトップ 3 列 (≥1024px は 2 列、それ以下は縦積み)
//   左カラム: WATCH NOTE / 右カラム: 採点
//   TL = cards (カードグリッド)
// ───────────────────────────────────────
function V3ThreeCol({ fixtureId, fixture, lineups, teamInfo, myRatings, viewOnly, note, isNoWatch }) {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingInline: 14 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 1fr) minmax(0, 1.4fr)',
        gap: 28,
        alignItems: 'start',
      }}
      className="lab-v3-grid">
        <section style={{ paddingTop: 14 }}>
          <WatchNoteHeading align="left" />
          <CardWrap>
            <NoteForm
              fixtureId={fixtureId}
              initialNote={note}
              afterSaveMode="refresh"
              layoutMode="wide"
              timelineMode="cards"
            />
          </CardWrap>
        </section>
        <section style={{ paddingTop: 14 }}>
          {!isNoWatch ? (
            <>
              <p style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
                color: 'rgba(255,255,255,0.4)', margin: '14px 0 16px',
                textAlign: 'left',
              }}>RATING</p>
              <CardWrap padding="6px 0 12px">
                <RatingPageView fixture={fixture} lineups={lineups} teamInfo={teamInfo} myRatings={myRatings} viewOnly={viewOnly} />
              </CardWrap>
            </>
          ) : (
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>
              観戦区分が「観てない」のため採点 UI は非表示
            </p>
          )}
        </section>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .lab-v3-grid {
            grid-template-columns: 1fr !important;
            gap: 20px !important;
          }
        }
      `}</style>
    </div>
  )
}

// ───────────────────────────────────────
// V4: タイムライン主役 (横スクロール)
//   タイムラインを最上部に大きく表示、観戦ノート入力はラジオを inline スクロール
// ───────────────────────────────────────
function V4TimelineFirst({ fixtureId, fixture, lineups, teamInfo, myRatings, viewOnly, note, isNoWatch }) {
  const hasTimeline = Array.isArray(note?.timeline) && note.timeline.length > 0
  return (
    <>
      {hasTimeline && (
        <section style={{ maxWidth: 1000, margin: '0 auto 28px', paddingInline: 14 }}>
          <p style={{
            fontSize: 10, fontWeight: 900, letterSpacing: '0.24em',
            color: '#00ff87', margin: '0 0 12px', textTransform: 'uppercase',
          }}>1 日のタイムライン</p>
          {/* TL display only — 既存ノートのタイムラインを横スクロールでヒーロー表示 */}
          <TimelineHero entries={note.timeline} />
        </section>
      )}
      <section style={{
        maxWidth: 640, margin: '0 auto 24px',
        paddingTop: 18, borderTop: '1px solid #1a1a1a',
      }}>
        <WatchNoteHeading />
        <NoteForm
          fixtureId={fixtureId}
          initialNote={note}
          afterSaveMode="refresh"
          layoutMode="inline"
          timelineMode="horizontal"
        />
      </section>
      {!isNoWatch && (
        <RatingPageView fixture={fixture} lineups={lineups} teamInfo={teamInfo} myRatings={myRatings} viewOnly={viewOnly} />
      )}
    </>
  )
}

// V4 専用: より大きい TimelineDisplay ラッパー
function TimelineHero({ entries }) {
  const sorted = [...entries]
    .filter(e => e && e.time && e.text)
    .sort((a, b) => String(a.time).localeCompare(String(b.time)))
  if (sorted.length === 0) return null
  return (
    <div style={{
      display: 'flex',
      gap: 12,
      overflowX: 'auto',
      paddingBlock: 8,
      paddingInline: 2,
      scrollbarWidth: 'thin',
    }}>
      {sorted.map((e, i) => (
        <div key={i} style={{
          flex: '0 0 200px',
          padding: '16px 18px',
          border: '1px solid rgba(255,255,255,0.12)',
          borderTop: '3px solid #00ff87',
          backgroundColor: 'rgba(0,255,135,0.04)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{
            fontSize: 13, fontWeight: 900, color: '#00ff87',
            letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums',
          }}>{e.time}</div>
          <div style={{
            fontSize: 13, lineHeight: 1.5, color: '#fff',
            wordBreak: 'break-word',
          }}>{e.text}</div>
        </div>
      ))}
    </div>
  )
}

// ───────────────────────────────────────
// V5: モバイル縦長カード (各セクション別カード)
//   TL = numbered (大きい連番)
// ───────────────────────────────────────
function V5MobileCards({ fixtureId, fixture, lineups, teamInfo, myRatings, viewOnly, note, isNoWatch }) {
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingInline: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <CardWrap padding="16px 16px 22px">
        <p style={{
          fontSize: 10, fontWeight: 900, letterSpacing: '0.22em',
          color: '#00ff87', margin: '0 0 14px', textTransform: 'uppercase',
        }}>Watch Note</p>
        <NoteForm
          fixtureId={fixtureId}
          initialNote={note}
          afterSaveMode="refresh"
          layoutMode="compact"
          timelineMode="numbered"
        />
      </CardWrap>
      {!isNoWatch && (
        <CardWrap padding="16px 0 22px">
          <p style={{
            fontSize: 10, fontWeight: 900, letterSpacing: '0.22em',
            color: '#00ff87', margin: '0 16px 14px', textTransform: 'uppercase',
          }}>Rating</p>
          <RatingPageView fixture={fixture} lineups={lineups} teamInfo={teamInfo} myRatings={myRatings} viewOnly={viewOnly} />
        </CardWrap>
      )}
    </div>
  )
}
