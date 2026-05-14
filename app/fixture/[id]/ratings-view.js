'use client'
import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { saveRatings } from './rating-actions'

const SCORE_MIN = 4.0
const SCORE_MAX = 8.5
const SCORE_STEP = 0.1
const SCORE_DEFAULT = 6.0
const SKIP_THRESHOLD_MINUTES = 20

function textColor(hex) {
  if (!hex || hex.length < 7) return '#fff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? '#fff' : '#000'
}

function fmtScore(n) {
  if (n == null) return '-'
  return Number(n).toFixed(1)
}

export default function RatingsView({
  fixtureId,
  fixture,
  lineups,
  aggregated,
  userId,
  profile,
  myRatings,
}) {
  // player_id → aggregated / own
  const aggMap = useMemo(() => {
    const m = new Map()
    for (const r of aggregated) m.set(r.player_id, r)
    return m
  }, [aggregated])

  const myMap = useMemo(() => {
    const m = new Map()
    for (const r of myRatings) m.set(r.player_id, r)
    return m
  }, [myRatings])

  // 推しクラブの出場選手
  const myClubLineups = profile
    ? lineups.filter(l => l.team_id === profile.supported_club_id)
    : []

  const isFinished = Boolean(fixture?.finished_at)
  const isRatable = Boolean(fixture?.ratable)
  const isClosed = Boolean(fixture?.closed)

  const canRate = Boolean(
    userId && profile && isRatable && myClubLineups.length > 0,
  )

  return (
    <section style={sectionStyle}>
      <div style={headerRowStyle}>
        <h2 style={headerTitleStyle}>選手採点</h2>
        {isFinished && fixture?.deadline_at && !isClosed && (
          <DeadlineBadge deadlineAt={fixture.deadline_at} />
        )}
      </div>

      <StatusMessages
        userId={userId}
        profile={profile}
        fixture={fixture}
        isFinished={isFinished}
        isRatable={isRatable}
        isClosed={isClosed}
        myClubLineups={myClubLineups}
        fixtureId={fixtureId}
      />

      {canRate ? (
        <RatingForm
          fixtureId={fixtureId}
          profile={profile}
          lineups={myClubLineups}
          myMap={myMap}
          aggMap={aggMap}
        />
      ) : (
        <AggregatedByTeam lineups={lineups} aggMap={aggMap} />
      )}
    </section>
  )
}

// ─────────────────────────────────────────────
// ステータスメッセージ
// ─────────────────────────────────────────────
function StatusMessages({
  userId, profile, fixture, isFinished, isRatable, isClosed,
  myClubLineups, fixtureId,
}) {
  const messages = []

  if (!isFinished) {
    messages.push({ tone: 'info', text: '試合終了後に採点できます' })
  } else if (isClosed) {
    messages.push({ tone: 'info', text: '採点は推しクラブの次戦キックオフまで（締切済み）' })
  } else if (!userId) {
    messages.push({
      tone: 'action',
      text: '採点するにはサインインが必要です',
      link: { href: `/sign-in?redirect_url=/fixture/${fixtureId}`, label: 'サインイン' },
    })
  } else if (!profile) {
    messages.push({
      tone: 'action',
      text: 'プロフィール設定（表示名・推しクラブ）が必要です',
      link: { href: `/profile-setup?next=/fixture/${fixtureId}`, label: '設定する' },
    })
  } else if (myClubLineups.length === 0) {
    messages.push({
      tone: 'info',
      text: `推しクラブ（${profile.club_name_ja ?? ''}）はこの試合に出場していません`,
    })
  }

  if (messages.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
      {messages.map((m, i) => (
        <div key={i} style={m.tone === 'action' ? msgActionStyle : msgInfoStyle}>
          {m.text}
          {m.link && (
            <>
              {'　'}
              <Link href={m.link.href} style={msgLinkStyle}>
                {m.link.label}
              </Link>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

function DeadlineBadge({ deadlineAt }) {
  const d = new Date(deadlineAt)
  return (
    <span style={{
      fontSize: 10, color: '#888', letterSpacing: '0.05em',
    }}>
      締切 {d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
    </span>
  )
}

// ─────────────────────────────────────────────
// 採点フォーム（推しクラブ選手のみ）
// ─────────────────────────────────────────────
function RatingForm({ fixtureId, profile, lineups, myMap, aggMap }) {
  const [state, formAction, isPending] = useActionState(saveRatings, null)

  return (
    <form action={formAction}>
      <input type="hidden" name="fixture_id" value={fixtureId} />

      <div style={{
        fontSize: 11, color: '#888', marginBottom: 10,
      }}>
        採点対象: <span style={{ color: profile.club_color, fontWeight: 700 }}>
          {profile.club_name_ja}
        </span> の出場選手
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {lineups.map(p => (
          <PlayerRatingRow
            key={p.player_id}
            player={p}
            existing={myMap.get(p.player_id)}
            agg={aggMap.get(p.player_id)}
            accentColor={profile.club_color}
          />
        ))}
      </div>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {state?.error && <div style={errorStyle}>{state.error}</div>}
        {state?.success && (
          <div style={successStyle}>保存しました（{state.saved} 件）</div>
        )}
        <button type="submit" disabled={isPending} style={submitStyle}>
          {isPending ? '保存中…' : '採点を保存'}
        </button>
      </div>
    </form>
  )
}

function PlayerRatingRow({ player, existing, agg, accentColor }) {
  // state:
  //   null    → 未採点 (送信時は skip される)
  //   'skip'  → 対象外 (skipped=TRUE)
  //   number  → 採点値
  const initial = existing?.skipped
    ? 'skip'
    : existing?.score != null
    ? Number(existing.score)
    : null

  const [value, setValue] = useState(initial)
  const displayScore =
    value === 'skip' ? '対象外'
    : value == null ? '未'
    : Number(value).toFixed(1)

  const minutes = player.minutes_played ?? 0
  const canSkip = minutes <= SKIP_THRESHOLD_MINUTES

  return (
    <div style={rowStyle}>
      <div style={rowTopStyle}>
        <span style={{ color: '#666', fontSize: 10, minWidth: 24 }}>
          #{player.number ?? '-'}
        </span>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: '#fff' }}>
          {player.name_ja ?? player.player_name_en}
        </span>
        <span style={{ fontSize: 10, color: '#666' }}>
          {player.position ?? ''}
          {player.is_starter ? '' : '(途)'}
          {' '}
          <span style={{ color: canSkip ? '#e5a53f' : '#444' }}>{minutes}&apos;</span>
        </span>
        {agg && (
          <span style={{ fontSize: 10, color: '#666', marginLeft: 8 }}>
            平均 {fmtScore(agg.avg_score)} ({agg.rate_count})
          </span>
        )}
      </div>

      <div style={rowSliderStyle}>
        <input
          type="range"
          min={SCORE_MIN}
          max={SCORE_MAX}
          step={SCORE_STEP}
          value={value === 'skip' || value == null ? SCORE_DEFAULT : value}
          onChange={e => setValue(Number(e.target.value))}
          disabled={value === 'skip'}
          style={{
            flex: 1,
            accentColor: accentColor ?? '#00ff87',
            opacity: value === 'skip' ? 0.3 : 1,
          }}
        />
        <span style={{
          minWidth: 52, textAlign: 'center',
          fontSize: 14, fontWeight: 700,
          color: value === 'skip'
            ? '#444'
            : value == null
            ? '#666'
            : accentColor ?? '#00ff87',
        }}>
          {displayScore}
        </span>
        {canSkip && (
          <button
            type="button"
            onClick={() => setValue(prev => (prev === 'skip' ? null : 'skip'))}
            style={{
              padding: '4px 8px',
              fontSize: 10,
              border: '1px solid #2a2a2a',
              backgroundColor: value === 'skip' ? accentColor ?? '#00ff87' : '#1a1a1a',
              color: value === 'skip' ? textColor(accentColor ?? '#00ff87') : '#666',
              cursor: 'pointer',
              minWidth: 56,
            }}
          >
            対象外
          </button>
        )}
      </div>

      <input
        type="hidden"
        name={`rating_${player.player_id}`}
        value={value === 'skip' ? 'skip' : value == null ? '' : String(value)}
      />
    </div>
  )
}

// ─────────────────────────────────────────────
// 閲覧専用: チームごとに集計表示
// ─────────────────────────────────────────────
function AggregatedByTeam({ lineups, aggMap }) {
  // team_id でグルーピング
  const byTeam = new Map()
  for (const l of lineups) {
    if (!byTeam.has(l.team_id)) byTeam.set(l.team_id, { team: l, rows: [] })
    byTeam.get(l.team_id).rows.push(l)
  }

  if (byTeam.size === 0) {
    return <div style={msgInfoStyle}>出場選手データがありません</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[...byTeam.values()].map(({ team, rows }) => {
        const rated = rows.filter(p => aggMap.has(p.player_id))
        return (
          <div key={team.team_id}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              color: team.team_color ?? '#fff', marginBottom: 6,
            }}>
              {team.team_name_ja}
            </div>
            {rated.length === 0 ? (
              <div style={{ fontSize: 11, color: '#555' }}>まだ採点がありません</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {rated
                  .slice()
                  .sort((a, b) =>
                    Number(aggMap.get(b.player_id).avg_score) -
                    Number(aggMap.get(a.player_id).avg_score),
                  )
                  .map(p => {
                    const agg = aggMap.get(p.player_id)
                    return (
                      <div key={p.player_id} style={aggregateRowStyle}>
                        <span style={{ color: '#666', fontSize: 10, minWidth: 24 }}>
                          #{p.number ?? '-'}
                        </span>
                        <span style={{ flex: 1, fontSize: 12 }}>
                          {p.name_ja ?? p.player_name_en}
                        </span>
                        <span style={{
                          fontSize: 14, fontWeight: 700,
                          color: team.team_color ?? '#00ff87',
                          minWidth: 40, textAlign: 'right',
                        }}>
                          {fmtScore(agg.avg_score)}
                        </span>
                        <span style={{
                          fontSize: 10, color: '#555', minWidth: 32, textAlign: 'right',
                        }}>
                          {agg.rate_count}票
                        </span>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const sectionStyle = {
  marginTop: 32,
  padding: 20,
  backgroundColor: '#111111',
  border: '1px solid #2a2a2a',
}

const headerRowStyle = {
  display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12,
}

const headerTitleStyle = {
  color: '#fff', fontSize: 14, fontWeight: 700,
  letterSpacing: '0.1em', margin: 0, textTransform: 'uppercase',
}

const rowStyle = {
  padding: '10px 12px',
  border: '1px solid #2a2a2a',
  backgroundColor: '#0a0a0a',
}

const rowTopStyle = {
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
}

const rowSliderStyle = {
  display: 'flex', alignItems: 'center', gap: 10,
}

const aggregateRowStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '4px 8px', backgroundColor: '#0a0a0a',
}

const msgInfoStyle = {
  fontSize: 11, color: '#888',
  padding: '8px 10px',
  backgroundColor: '#1a1a1a',
  border: '1px solid #2a2a2a',
}

const msgActionStyle = {
  fontSize: 12, color: '#e5a53f',
  padding: '8px 10px',
  backgroundColor: '#1a1410',
  border: '1px solid #3a2a14',
}

const msgLinkStyle = {
  color: '#00ff87', textDecoration: 'underline',
}

const submitStyle = {
  padding: '12px',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.06em',
  backgroundColor: '#00ff87',
  color: '#000',
  border: 'none',
  cursor: 'pointer',
  width: '100%',
}

const errorStyle = {
  fontSize: 12, color: '#ef5350',
  padding: '8px 10px',
  backgroundColor: '#1a0f0f',
  border: '1px solid #3a1a1a',
}

const successStyle = {
  fontSize: 12, color: '#00ff87',
  padding: '8px 10px',
  backgroundColor: '#0a1a10',
  border: '1px solid #1a3a2a',
}
