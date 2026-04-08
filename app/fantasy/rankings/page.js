'use client'
import { useEffect, useState } from 'react'
import FantasyLoading from '../FantasyLoading'
import ScrollingName from '../ScrollingName'

function textColor(hex) {
  if (!hex) return '#fff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? '#fff' : '#000'
}

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' }

function FormationModal({ user, onClose, nextOpponents }) {
  const [squad, setSquad] = useState(null)

  useEffect(() => {
    fetch(`/api/fantasy/squad/public?user_id=${user.clerk_user_id}`)
      .then(r => r.json())
      .then(d => setSquad(d.squad ?? []))
      .catch(() => setSquad([]))
  }, [user.clerk_user_id])

  const starters = squad ?? []

  const PlayerCard = ({ p }) => {
    const color = p.team_color ?? '#555'
    const tc = textColor(color)
    const offX = p.pos_offset_x ?? 0
    const offY = p.pos_offset_y ?? 0
    const opp = nextOpponents?.[p.team_id]
    return (
      <div style={{ flex: '0 0 auto', transform: `translate(${offX}px, ${offY}px)`, position: 'relative', paddingTop: 14 }}>
        <div style={{
          position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
          width: 30, height: 30, borderRadius: '50%', backgroundColor: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 900, color: tc,
          boxShadow: 'rgba(0,0,0,0.6) 0px 2px 2px', zIndex: 1,
        }}>
          {p.no ?? '?'}
          {p.is_captain && (
            <div style={{ position: 'absolute', top: -4, right: -4, width: 13, height: 13, borderRadius: '50%', backgroundColor: '#fffc2b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 7, fontWeight: 900, color: '#000', lineHeight: 1 }}>C</span>
            </div>
          )}
        </div>
        <div style={{ display: 'inline-flex', flexDirection: 'column', whiteSpace: 'nowrap', boxShadow: 'rgba(0,0,0,0.5) 0px 2px 1px', position: 'relative', zIndex: 2 }}>
          <ScrollingName name={p.name_ja ?? p.name_en} color={color} tc={tc} />
          <div style={{ backgroundColor: '#262626', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 13, padding: '0 5px', gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#e7e7e7', letterSpacing: '0.1em' }}>{p.position}</span>
            {opp && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 2, lineHeight: 1 }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.3)' }}>vs</span>
                <span style={{ fontSize: 8, fontWeight: 700, color: '#e7e7e7', whiteSpace: 'nowrap' }}>{opp.abbr}</span>
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: opp.color ?? '#888', flexShrink: 0, display: 'inline-block' }} />
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  const Row = ({ players }) => (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 40, alignItems: 'flex-start' }}>
      {players.map(p => <PlayerCard key={p.player_id} p={p} />)}
    </div>
  )

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        backgroundColor: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 960, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
        {/* ヘッダー */}
        <div style={{ backgroundColor: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: user.team_color ?? 'var(--text-primary)' }}>{user.team_name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{user.username}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* フォーメーション */}
        <div style={{ backgroundImage: 'url(/pitch.png)', backgroundSize: '100% 100%', minHeight: 420, position: 'relative', overflow: 'hidden' }}>
          {squad === null ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 28, height: 28, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            </div>
          ) : starters.length === 0 ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>スタメン未登録</p>
            </div>
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '38px 16px 8px' }}>
              {['FW','MF','DF','GK'].map(pos => {
                const players = starters.filter(p => p.position === pos)
                if (players.length === 0) return null
                return <Row key={pos} players={players} />
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function RankingsPage() {
  const [rankings, setRankings] = useState([])
  const [myId, setMyId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modalUser, setModalUser] = useState(null)
  const [nextOpponents, setNextOpponents] = useState({})

  useEffect(() => {
    Promise.all([
      fetch('/api/fantasy/rankings').then(r => r.json()),
      fetch('/api/fantasy/me').then(r => r.json()),
    ]).then(([r, m]) => {
      setRankings(r.rankings ?? [])
      setMyId(m.user?.id ?? null)
    }).finally(() => setLoading(false))
    fetch('/api/fantasy/next-opponents').then(r => r.json()).then(d => setNextOpponents(d.opponents ?? {})).catch(() => {})
  }, [])

  if (loading) return <FantasyLoading />

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {modalUser && <FormationModal user={modalUser} onClose={() => setModalUser(null)} nextOpponents={nextOpponents} />}

      <p style={{ fontSize: 11, letterSpacing: '0.15em', color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase' }}>Fantasy J.League</p>
      <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 32px' }}>Ranking</h1>

      {rankings.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>まだ参加者がいません</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* ヘッダー行 */}
          <div style={{
            display: 'grid', gridTemplateColumns: '44px 1fr auto',
            padding: '6px 16px', fontSize: 10, letterSpacing: '0.1em',
            color: 'var(--text-secondary)', textTransform: 'uppercase',
          }}>
            <span>Rank</span>
            <span>Club</span>
            <span style={{ textAlign: 'right' }}>Pts</span>
          </div>

          {rankings.map((row) => {
            const isMe = row.id === myId
            const medal = MEDAL[row.rank]
            return (
              <div
                key={row.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '44px 1fr auto',
                  alignItems: 'center',
                  padding: '14px 16px',
                  backgroundColor: '#1a1a1a',
                  border: isMe ? '1px solid rgba(0,255,135,0.25)' : '1px solid transparent',
                  borderRadius: 4,
                  gap: 12,
                }}
              >
                {/* 順位 */}
                <div style={{ fontSize: 15, fontWeight: 800, color: row.rank <= 3 ? 'var(--accent)' : 'var(--text-secondary)', textAlign: 'center' }}>
                  {medal ?? row.rank}
                </div>

                {/* クラブ情報（クリックでフォーメーション表示） */}
                <div
                  onClick={() => setModalUser(row)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, cursor: 'pointer' }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 4, flexShrink: 0,
                    backgroundColor: row.team_color ?? '#e00000',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800,
                    color: textColor(row.team_color ?? '#e00000'),
                  }}>
                    {(row.team_name ?? '?').slice(0, 2)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 700,
                      color: isMe ? 'var(--accent)' : 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {row.team_name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>
                      {row.username}
                    </div>
                  </div>
                </div>

                {/* ポイント */}
                <div style={{
                  fontSize: 20, fontWeight: 900,
                  color: row.rank <= 3 ? 'var(--accent)' : 'var(--text-primary)',
                  textAlign: 'right', letterSpacing: '-0.02em',
                }}>
                  {row.total_points}
                  <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 3 }}>pt</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
