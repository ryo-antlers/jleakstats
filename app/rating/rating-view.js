'use client'
import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveRatings } from '@/app/fixture/[id]/rating-actions'

const SCORE_MIN = 4.0
const SCORE_MAX = 8.5
const SCORE_STEP = 0.1
const SCORE_DEFAULT = 6.0
const SKIP_THRESHOLD_MINUTES = 20

const POSITION_ORDER = ['G', 'D', 'M', 'F']
const POSITION_LABEL = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' }

function normalizeColor(raw) {
  if (!raw) return null
  const v = String(raw).trim()
  if (!v) return null
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

function fmtScore(n) {
  if (n == null) return '-'
  return Number(n).toFixed(1)
}

function interp(a, b, k) {
  const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16)
  const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16)
  const r = Math.round(ar + (br - ar) * k)
  const g = Math.round(ag + (bg - ag) * k)
  const c = Math.round(ab + (bb - ab) * k)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${c.toString(16).padStart(2, '0')}`
}

function scoreColor(n) {
  if (n == null) return '#666'
  const t = Math.max(0, Math.min(1, (n - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)))
  // 黄 → 緑
  return interp('#facc15', '#22c55e', t)
}

export default function RatingPageView({ fixture, lineups, teamInfo, myRatings, viewOnly = false, viewerName = null }) {
  const myMap = useMemo(() => {
    const m = new Map()
    for (const r of myRatings) m.set(Number(r.player_id), r)
    return m
  }, [myRatings])

  const initialPlayers = useMemo(() => lineups.map(l => {
    const my = myMap.get(Number(l.player_id))
    let value = ''
    if (my) {
      value = my.skipped ? 'skip' : (my.score != null ? Number(my.score).toFixed(1) : '')
    }
    return { ...l, _value: value }
  }), [lineups, myMap])

  const [players, setPlayers] = useState(initialPlayers)
  const [state, formAction, isPending] = useActionState(saveRatings, null)
  const [successFlash, setSuccessFlash] = useState(false)
  const prevSuccessRef = useRef(false)
  const router = useRouter()

  useEffect(() => {
    if (state?.success && !prevSuccessRef.current) {
      prevSuccessRef.current = true
      setSuccessFlash(true)
      const t = setTimeout(() => {
        router.push('/rating')
      }, 1200)
      return () => clearTimeout(t)
    }
  }, [state, router])

  const setValue = (playerId, value) => {
    setPlayers(prev => prev.map(p =>
      Number(p.player_id) === Number(playerId) ? { ...p, _value: value } : p
    ))
  }

  const clubColor = normalizeColor(teamInfo?.color) ?? '#444'

  // ポジション別 + ベンチ
  const groups = useMemo(() => {
    const buckets = { G: [], D: [], M: [], F: [], SUB: [] }
    for (const p of players) {
      if (!p.is_starter) {
        buckets.SUB.push(p)
      } else {
        const pos = String(p.position ?? '').toUpperCase().slice(0, 1)
        if (buckets[pos]) buckets[pos].push(p)
        else buckets.SUB.push(p)
      }
    }
    // SUB は出場時間が長い順、同じならポジション順
    const POS_ORDER = { G: 1, D: 2, M: 3, F: 4 }
    buckets.SUB.sort((a, b) => {
      const am = Number(a.minutes_played ?? 0)
      const bm = Number(b.minutes_played ?? 0)
      if (am !== bm) return bm - am
      const ap = String(a.position ?? '').toUpperCase().slice(0, 1)
      const bp = String(b.position ?? '').toUpperCase().slice(0, 1)
      return (POS_ORDER[ap] ?? 9) - (POS_ORDER[bp] ?? 9)
    })
    return buckets
  }, [players])

  const totalRated = players.filter(p => p._value && p._value !== '').length

  // viewOnlyのときは setValue を no-op に置き換え (子コンポーネントの操作を無効化)
  const effectiveSetValue = viewOnly ? () => {} : setValue

  return (
    <div style={{ marginTop: 16, maxWidth: 560, margin: '16px auto 0' }}>
      {/* タイトル */}
      <div style={{
        textAlign: 'center', marginBottom: 18, paddingTop: 8,
        borderTop: '1px solid #1a1a1a',
      }}>
        <p style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
          color: 'rgba(255,255,255,0.4)', margin: '14px 0 8px',
        }}>RATING</p>
        <p style={{
          fontSize: 18, fontWeight: 900, color: '#fff',
          margin: 0, letterSpacing: '0.04em',
        }}>
          {viewerName ? `${viewerName} さんの採点` : (viewOnly ? 'あなたの採点' : '採点する')}
        </p>
        <p style={{
          fontSize: 11, color: 'rgba(255,255,255,0.55)',
          letterSpacing: '0.06em', margin: '4px 0 0',
        }}>
          {teamInfo?.name_ja}
        </p>
        {!viewOnly && fixture.deadline_at && (
          <DeadlineBadge deadlineAt={fixture.deadline_at} />
        )}
      </div>

      {/* フォーム */}
      <form action={formAction}>
        <input type="hidden" name="fixture_id" value={fixture.id} />
        {players.map(p => (
          <input
            key={p.player_id}
            type="hidden"
            name={`rating_${p.player_id}`}
            value={p._value}
          />
        ))}

        {POSITION_ORDER.map(pos => {
          const list = groups[pos]
          if (!list || list.length === 0) return null
          return (
            <PositionRow
              key={pos}
              label={POSITION_LABEL[pos]}
              players={list}
              clubColor={clubColor}
              setValue={effectiveSetValue}
              viewOnly={viewOnly}
            />
          )
        })}
        {groups.SUB.length > 0 && (
          <PositionRow
            label="SUB"
            players={groups.SUB}
            clubColor={clubColor}
            setValue={effectiveSetValue}
            viewOnly={viewOnly}
          />
        )}

        {/* 閲覧モード時は保存セクションなし */}
        {!viewOnly && successFlash && (
          <div style={{
            marginTop: 20,
            padding: '12px 16px',
            backgroundColor: 'rgba(0,255,135,0.12)',
            border: '1px solid #00ff87',
            color: '#00ff87',
            fontSize: 12, fontWeight: 800,
            letterSpacing: '0.06em',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 16 }}>✓</span>
            <span>採点を保存しました — TOPに戻ります</span>
          </div>
        )}

        {/* 保存バー (編集モードのみ) */}
        {!viewOnly && (
          <div style={{
            marginTop: successFlash ? 12 : 28, paddingTop: 18,
            borderTop: '1px solid #1a1a1a',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 12, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
              {totalRated} / {players.length} 名 採点済み
            </span>
            <button
              type="submit"
              disabled={isPending || successFlash || totalRated === 0}
              style={{
                padding: '10px 24px',
                fontSize: 12, fontWeight: 800,
                letterSpacing: '0.1em',
                border: 'none', cursor: (isPending || successFlash || totalRated === 0) ? 'not-allowed' : 'pointer',
                backgroundColor: totalRated === 0 ? 'rgba(0,255,135,0.18)' : '#00ff87',
                color: totalRated === 0 ? 'rgba(255,255,255,0.3)' : '#000',
                textTransform: 'uppercase',
                transition: 'background-color 0.2s ease, color 0.2s ease',
                fontFamily: 'inherit',
              }}
            >
              {isPending ? '保存中…' : successFlash ? '保存完了' : '採点を保存'}
            </button>
          </div>
        )}

        {!viewOnly && state?.error && (
          <div style={{
            marginTop: 12, padding: '8px 12px', fontSize: 11, color: '#ef5350',
            backgroundColor: 'rgba(239,83,80,0.08)', borderLeft: '2px solid #ef5350',
          }}>{state.error}</div>
        )}
      </form>

    </div>
  )
}

function PositionRow({ label, players, clubColor, setValue, viewOnly }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 22,
      }}>
        <span style={{
          display: 'inline-block', width: 4, height: 14,
          backgroundColor: clubColor, flexShrink: 0,
        }} />
        <span style={{
          fontSize: 11, fontWeight: 800, color: '#fff',
          letterSpacing: '0.18em',
        }}>
          {label}
        </span>
      </div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 24,
      }}>
        {players.map(p => (
          <PlayerDonut
            key={p.player_id}
            player={p}
            setValue={setValue}
            viewOnly={viewOnly}
          />
        ))}
      </div>
    </div>
  )
}

function PlayerDonut({ player, setValue, viewOnly }) {
  const isSkipped = player._value === 'skip'
  const numericValue = !isSkipped && player._value !== '' ? Number(player._value) : null
  const sCol = scoreColor(numericValue)
  const minutes = Number(player.minutes_played ?? 0)
  const name = player.name_ja ?? player.player_name_en ?? '-'
  const isShort = minutes <= SKIP_THRESHOLD_MINUTES

  // ドーナツ計算
  const size = 56
  const strokeW = 4
  const r = (size - strokeW) / 2
  const cx = size / 2, cy = size / 2
  const circumference = 2 * Math.PI * r
  const t = numericValue == null ? 0 : (numericValue - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)

  // スライダーは未採点時 6.0 を表示するが値はセットしない
  const sliderValue = isSkipped ? SCORE_DEFAULT : (numericValue ?? SCORE_DEFAULT)

  const onSlide = (e) => {
    const v = Number(e.target.value)
    setValue(player.player_id, v.toFixed(1))
  }

  const toggleSkip = () => {
    setValue(player.player_id, isSkipped ? '' : 'skip')
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 10,
      width: 70,
    }}>
      {/* ドーナツ */}
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ display: 'block' }}>
          <circle cx={cx} cy={cy} r={r}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={strokeW}
          />
          {numericValue != null && !isSkipped && (
            <circle cx={cx} cy={cy} r={r}
              fill="none"
              stroke={sCol}
              strokeWidth={strokeW}
              strokeDasharray={`${circumference * t} ${circumference}`}
              strokeLinecap="round"
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ transition: 'stroke-dasharray 0.2s ease, stroke 0.2s ease' }}
            />
          )}
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isSkipped ? (
            <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
              なし
            </span>
          ) : numericValue != null ? (
            <span style={{
              fontSize: 15, fontWeight: 900,
              color: sCol, lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {fmtScore(numericValue)}
            </span>
          ) : (
            <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.25)', lineHeight: 1 }}>−</span>
          )}
        </div>
      </div>

      {/* スライダー (ドーナツとの間に余白) */}
      <input
        type="range"
        className="rating-slider"
        min={SCORE_MIN}
        max={SCORE_MAX}
        step={SCORE_STEP}
        value={sliderValue}
        disabled={isSkipped || viewOnly}
        onChange={onSlide}
        style={{ '--score-color': sCol, marginTop: 10, visibility: (viewOnly && numericValue == null && !isSkipped) ? 'hidden' : 'visible' }}
      />

      {/* 名前 (長くても省略しない) */}
      <div style={{
        fontSize: 10, color: '#fff', fontWeight: 700,
        textAlign: 'center', lineHeight: 1.3,
        wordBreak: 'keep-all',
      }}>
        {player.number != null && (
          <span style={{ color: 'rgba(255,255,255,0.45)', marginRight: 3, fontWeight: 600 }}>
            {player.number}
          </span>
        )}
        {name}
      </div>

      {/* 出場分 */}
      <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums' }}>
        {minutes}'
      </div>

      {/* 短く採点なしトグル (≤20min のみ、編集モードのみ) */}
      {isShort && !viewOnly && (
        <button
          type="button"
          onClick={toggleSkip}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 9, padding: '3px 7px',
            border: `1px solid ${isSkipped ? '#00ff87' : 'transparent'}`,
            backgroundColor: isSkipped ? 'rgba(0,255,135,0.12)' : 'transparent',
            color: isSkipped ? '#00ff87' : 'rgba(255,255,255,0.65)',
            cursor: 'pointer', fontFamily: 'inherit',
            letterSpacing: '0.04em', whiteSpace: 'nowrap',
            fontWeight: 700,
            transition: 'border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease',
          }}
        >
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 10, height: 10,
            border: `1px solid ${isSkipped ? '#00ff87' : 'rgba(255,255,255,0.4)'}`,
            backgroundColor: isSkipped ? '#00ff87' : 'transparent',
            color: '#000', fontSize: 8, fontWeight: 900, lineHeight: 1,
          }}>
            {isSkipped ? '✓' : ''}
          </span>
          採点なし
        </button>
      )}
    </div>
  )
}

function DeadlineBadge({ deadlineAt }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  const remaining = Math.max(0, new Date(deadlineAt).getTime() - now)
  const hours = Math.floor(remaining / 3600_000)
  const minutes = Math.floor((remaining % 3600_000) / 60_000)
  // 残り時間で色分け: <24h 赤 / <72h 黄 / それ以上 緑
  let color, borderColor
  if (hours < 24) {
    color = '#ef5350'                       // 赤
    borderColor = 'rgba(239,83,80,0.4)'
  } else if (hours < 72) {
    color = '#facc15'                       // 黄
    borderColor = 'rgba(250,204,21,0.4)'
  } else {
    color = '#22c55e'                       // 緑
    borderColor = 'rgba(34,197,94,0.4)'
  }
  return (
    <div style={{
      display: 'inline-block', marginTop: 6,
      padding: '3px 10px',
      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
      color,
      border: `1px solid ${borderColor}`,
    }}>
      締切まで {hours}h {String(minutes).padStart(2, '0')}m
    </div>
  )
}


