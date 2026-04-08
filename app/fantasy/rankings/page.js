'use client'
import { useEffect, useState } from 'react'
import FantasyLoading from '../FantasyLoading'

function textColor(hex) {
  if (!hex) return '#fff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? '#fff' : '#000'
}

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default function RankingsPage() {
  const [rankings, setRankings] = useState([])
  const [myId, setMyId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/fantasy/rankings').then(r => r.json()),
      fetch('/api/fantasy/me').then(r => r.json()),
    ]).then(([r, m]) => {
      setRankings(r.rankings ?? [])
      setMyId(m.user?.id ?? null)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <FantasyLoading />

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
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
                  backgroundColor: isMe ? 'rgba(0,255,135,0.06)' : 'var(--bg-secondary)',
                  border: isMe ? '1px solid rgba(0,255,135,0.25)' : '1px solid transparent',
                  borderRadius: 4,
                  gap: 12,
                }}
              >
                {/* 順位 */}
                <div style={{ fontSize: 15, fontWeight: 800, color: row.rank <= 3 ? 'var(--accent)' : 'var(--text-secondary)', textAlign: 'center' }}>
                  {medal ?? row.rank}
                </div>

                {/* クラブ情報 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
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
