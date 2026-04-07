'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const POSITIONS = ['GK', 'DF', 'MF', 'FW']
const POS_LIMITS = { GK: 2, DF: 6, MF: 6, FW: 5 }
const POS_MIN = { GK: 1, DF: 3, MF: 3, FW: 1 }

export default function SquadPage() {
  const router = useRouter()
  const [players, setPlayers] = useState([])
  const [squad, setSquad] = useState([])
  const [user, setUser] = useState(null)
  const [tab, setTab] = useState('GK')
  const [teamFilter, setTeamFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/fantasy/players').then(r => r.json()),
      fetch('/api/fantasy/squad').then(r => r.json()),
      fetch('/api/fantasy/me').then(r => r.json()),
    ]).then(([p, s, u]) => {
      if (!u.user) { router.push('/fantasy/setup'); return }
      setPlayers(p.players ?? [])
      setSquad(s.squad ?? [])
      setUser(u.user)
    }).finally(() => setLoading(false))
  }, [])

  const squadIds = new Set(squad.map(s => s.player_id))
  const posCounts = {}
  for (const s of squad) {
    posCounts[s.position] = (posCounts[s.position] ?? 0) + 1
  }

  const teams = ['ALL', ...new Set(players.map(p => p.team_abbr).filter(Boolean))]

  const filtered = players.filter(p =>
    p.position === tab &&
    (teamFilter === 'ALL' || p.team_abbr === teamFilter)
  )

  // 最低条件チェック
  const minMet = POSITIONS.every(pos => (posCounts[pos] ?? 0) >= POS_MIN[pos]) && squad.length >= 11

  async function addPlayer(player) {
    setActionLoading(true)
    setMessage(null)
    const res = await fetch('/api/fantasy/squad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: player.id }),
    })
    const data = await res.json()
    if (!res.ok) { setMessage({ type: 'error', text: data.error }); setActionLoading(false); return }
    const [s, u] = await Promise.all([
      fetch('/api/fantasy/squad').then(r => r.json()),
      fetch('/api/fantasy/me').then(r => r.json()),
    ])
    setSquad(s.squad ?? [])
    setUser(u.user)
    setActionLoading(false)
  }

  async function sellPlayer(player) {
    if (!confirm(`${player.name_ja ?? player.name_en}を売却しますか？（手数料5%）`)) return
    setActionLoading(true)
    setMessage(null)
    const res = await fetch('/api/fantasy/squad', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: player.player_id }),
    })
    const data = await res.json()
    if (!res.ok) { setMessage({ type: 'error', text: data.error }); setActionLoading(false); return }
    const [s, u] = await Promise.all([
      fetch('/api/fantasy/squad').then(r => r.json()),
      fetch('/api/fantasy/me').then(r => r.json()),
    ])
    setSquad(s.squad ?? [])
    setUser(u.user)
    setActionLoading(false)
  }

  if (loading) return null

  const budgetDisplay = (user?.budget ?? 0).toLocaleString()

  return (
    <div className="max-w-2xl">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>スカッド選択</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            残高 ¥{budgetDisplay} · {squad.length}/15人
          </p>
        </div>
        <a href="/fantasy" className="text-xs px-3 py-1.5 rounded" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
          ← 戻る
        </a>
      </div>

      {message && (
        <p className="text-xs mb-3 px-3 py-2 rounded" style={{ backgroundColor: message.type === 'error' ? '#3a1a1a' : '#1a3a1a', color: message.type === 'error' ? '#e55' : '#5e5' }}>
          {message.text}
        </p>
      )}

      {/* 最低条件 & 確定ボタン */}
      <div className="mb-5 rounded-lg p-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>最低条件：</span>
            {POSITIONS.map(pos => {
              const cnt = posCounts[pos] ?? 0
              const min = POS_MIN[pos]
              const ok = cnt >= min
              return (
                <span key={pos} className="text-xs font-medium" style={{ color: ok ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {ok ? '✓' : '○'} {pos} {cnt}/{min}
                </span>
              )
            })}
            <span className="text-xs font-medium" style={{ color: squad.length >= 11 ? 'var(--accent)' : 'var(--text-secondary)' }}>
              {squad.length >= 11 ? '✓' : '○'} 計 {squad.length}/11人
            </span>
          </div>
          <button
            onClick={() => router.push('/fantasy')}
            disabled={!minMet}
            className="text-xs px-4 py-2 rounded font-bold"
            style={{
              backgroundColor: minMet ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: minMet ? '#000' : 'var(--text-secondary)',
              cursor: minMet ? 'pointer' : 'not-allowed',
              whiteSpace: 'nowrap',
            }}
          >
            スカッドを確定する
          </button>
        </div>
      </div>

      {/* 現在のスカッド */}
      <div className="mb-5 rounded-lg p-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
        <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>現在のスカッド</p>
        {squad.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>まだ選手がいません</p>
        ) : (
          <div className="flex flex-col gap-1">
            {POSITIONS.map(pos => {
              const posPlayers = squad.filter(s => s.position === pos)
              if (posPlayers.length === 0) return null
              return (
                <div key={pos}>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{pos} </span>
                  {posPlayers.map(p => (
                    <span key={p.player_id} className="inline-flex items-center gap-1 mr-2">
                      <span className="text-xs" style={{ color: 'var(--text-primary)' }}>{p.name_ja ?? p.name_en}</span>
                      <button onClick={() => sellPlayer(p)} className="text-xs" style={{ color: '#e55' }} disabled={actionLoading}>×</button>
                    </span>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ポジションタブ */}
      <div className="flex gap-1 mb-3">
        {POSITIONS.map(pos => {
          const cnt = posCounts[pos] ?? 0
          const limit = POS_LIMITS[pos]
          return (
            <button
              key={pos}
              onClick={() => setTab(pos)}
              className="flex-1 text-xs py-1.5 rounded font-medium"
              style={{
                backgroundColor: tab === pos ? 'var(--accent)' : 'var(--bg-secondary)',
                color: tab === pos ? '#000' : 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
              }}
            >
              {pos} {cnt}/{limit}
            </button>
          )
        })}
      </div>

      {/* チームフィルター */}
      <div className="flex gap-1 flex-wrap mb-3">
        {teams.map(t => (
          <button
            key={t}
            onClick={() => setTeamFilter(t)}
            className="text-xs px-2 py-1 rounded"
            style={{
              backgroundColor: teamFilter === t ? 'var(--bg-tertiary)' : 'transparent',
              color: teamFilter === t ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: '1px solid var(--border-color)',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 選手一覧 */}
      <div className="flex flex-col gap-1">
        {filtered.map(p => {
          const inSquad = squadIds.has(p.id)
          const posCount = posCounts[p.position] ?? 0
          const posOver = posCount >= POS_LIMITS[p.position]
          const budgetOver = (user?.budget ?? 0) < p.price
          const squadFull = squad.length >= 15
          const canAdd = !inSquad && !posOver && !budgetOver && !squadFull
          return (
            <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', opacity: inSquad ? 0.5 : 1 }}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: p.team_color ?? '#888', color: '#fff', fontSize: 10 }}>{p.team_abbr}</span>
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{p.name_ja ?? p.name_en}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>¥{p.price?.toLocaleString()}</span>
                {inSquad ? (
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>獲得済</span>
                ) : (
                  <button
                    onClick={() => addPlayer(p)}
                    disabled={!canAdd || actionLoading}
                    className="text-xs px-3 py-1 rounded font-medium"
                    style={{
                      backgroundColor: canAdd ? 'var(--accent)' : 'var(--bg-tertiary)',
                      color: canAdd ? '#000' : 'var(--text-secondary)',
                      cursor: canAdd ? 'pointer' : 'not-allowed',
                    }}
                  >
                    獲得
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
