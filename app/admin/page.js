'use client'
import { useState, useEffect } from 'react'

function SyncButton({ label, endpoint, description }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  async function run() {
    setLoading(true)
    setStatus(null)
    try {
      const res = await fetch(endpoint)
      const data = await res.json()
      setStatus(data.ok ? `✅ ${JSON.stringify(data)}` : `❌ ${data.error}`)
    } catch (e) {
      setStatus(`❌ ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</p>
          <p style={{ fontSize: 11, marginTop: 2, color: 'var(--text-secondary)' }}>{description}</p>
        </div>
        <button onClick={run} disabled={loading} style={{
          flexShrink: 0, padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700,
          backgroundColor: loading ? 'var(--bg-tertiary)' : 'var(--accent)',
          color: '#000', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
        }}>
          {loading ? '実行中…' : '実行'}
        </button>
      </div>
      {status && <p style={{ fontSize: 11, marginTop: 8, fontFamily: 'monospace', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{status}</p>}
    </div>
  )
}

function UnregisteredPlayersCheck() {
  const [players, setPlayers] = useState(null)
  const [loading, setLoading] = useState(false)

  async function run() {
    setLoading(true)
    setPlayers(null)
    try {
      const res = await fetch('/api/admin/unregistered-players')
      const data = await res.json()
      setPlayers(data.players ?? [])
    } catch (e) {
      setPlayers([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>未登録選手チェック</p>
          <p style={{ fontSize: 11, marginTop: 2, color: 'var(--text-secondary)' }}>試合データにいるがplayers_masterに未登録のID</p>
        </div>
        <button onClick={run} disabled={loading} style={{
          padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700,
          backgroundColor: loading ? 'var(--bg-tertiary)' : 'var(--accent)',
          color: '#000', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
        }}>
          {loading ? '確認中…' : '確認'}
        </button>
      </div>
      {players !== null && (
        players.length === 0
          ? <p style={{ fontSize: 12, color: '#00ff87' }}>未登録選手はいません ✅</p>
          : (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 12, color: '#ff6b6b', marginBottom: 6 }}>{players.length}人の未登録選手が見つかりました</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {players.map((p, i) => (
                  <span key={i} style={{ fontSize: 12, fontFamily: 'monospace', padding: '2px 8px', borderRadius: 4, backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
                    [{p.source}] {p.player_id ?? 'ID無し'} {p.player_name_en ?? ''}
                  </span>
                ))}
              </div>
            </div>
          )
      )}
    </div>
  )
}

function FantasyGwActions() {
  const [gameweeks, setGameweeks] = useState([])
  const [selectedGw, setSelectedGw] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)

  useEffect(() => {
    fetch('/api/fantasy/gameweeks').then(r => r.json()).then(d => {
      const gws = d.gameweeks ?? []
      setGameweeks(gws)
      if (gws.length) setSelectedGw(String(gws.at(-1).id))
    })
  }, [])

  async function run(endpoint) {
    if (!selectedGw) return
    setLoading(true)
    setStatus(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameweek_id: Number(selectedGw) }),
      })
      const data = await res.json()
      setStatus(data.ok ? `✅ ${JSON.stringify(data)}` : `❌ ${data.error}`)
    } catch (e) {
      setStatus(`❌ ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function checkPoints() {
    if (!selectedGw) return
    setLoading(true)
    setStatus(null)
    try {
      const res = await fetch('/api/admin/check-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameweek_id: Number(selectedGw) }),
      })
      const data = await res.json()
      if (!data.ok) { setStatus(`❌ ${data.error}`); return }
      if (data.missing === 0) {
        setStatus(`✅ 全選手のポイントが登録済みです（${data.fixtures}試合）`)
      } else {
        const names = data.players.map(p => p.name_ja ?? p.name_en ?? p.player_id).join(', ')
        setStatus(`⚠️ ${data.missing}人が未登録: ${names}`)
      }
    } catch (e) {
      setStatus(`❌ ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function runAutoProcess() {
    setLoading(true)
    setStatus(null)
    try {
      const res = await fetch('/api/admin/run-auto-process', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setStatus(`✅ ${data.log?.length ? data.log.join(' / ') : '処理なし（全GW処理済み）'}`)
      } else {
        setStatus(`❌ ${data.error}`)
      }
    } catch (e) {
      setStatus(`❌ ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function checkSnapshot() {
    if (!selectedGw) return
    setLoading(true)
    setStatus(null)
    try {
      const res = await fetch(`/api/fantasy/gw-starters?gameweek_id=${selectedGw}`)
      const data = await res.json()
      if (data.error) { setStatus(`❌ ${data.error}`); return }
      const users = data.users ?? []
      if (users.length === 0) {
        setStatus(`⚠️ GW${gameweeks.find(g => String(g.id) === selectedGw)?.gw_number}のSnapshotはまだ取得されていません`)
      } else {
        setStatus(`✅ Snapshot取得済み: ${users.length}人 (${users.map(u => `${u.clerk_user_id.slice(0, 8)}…:${u.count}人`).join(', ')})`)
      }
    } catch (e) {
      setStatus(`❌ ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>ファンタジー手動操作</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>対象GW</span>
        <select value={selectedGw} onChange={e => setSelectedGw(e.target.value)} style={{
          fontSize: 12, padding: '4px 8px', borderRadius: 4,
          backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)',
        }}>
          {gameweeks.map(gw => <option key={gw.id} value={gw.id}>GW{gw.gw_number}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={checkPoints} disabled={loading || !selectedGw} style={{
          padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
          backgroundColor: '#1a4a2a', color: '#00ff87', border: '1px solid #00ff87',
          cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
        }}>ポイント確認</button>
        <button onClick={checkSnapshot} disabled={loading || !selectedGw} style={{
          padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
          backgroundColor: '#1a2a4a', color: '#87c8ff', border: '1px solid #87c8ff',
          cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
        }}>Snapshot確認</button>
        <button onClick={runAutoProcess} disabled={loading} style={{
          padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
          backgroundColor: '#2a1a4a', color: '#c87fff', border: '1px solid #c87fff',
          cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
        }}>ポイント計算実行</button>
        {[
          { label: 'ユーザーPT付与', endpoint: '/api/fantasy/calc-user-points' },
          { label: '移籍金変動', endpoint: '/api/fantasy/update-prices' },
        ].map(({ label, endpoint }) => (
          <button key={label} onClick={() => run(endpoint)} disabled={loading || !selectedGw} style={{
            padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
            backgroundColor: loading ? 'var(--bg-tertiary)' : 'var(--accent)',
            color: '#000', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
          }}>{label}</button>
        ))}
      </div>
      {status && <p style={{ fontSize: 11, marginTop: 10, fontFamily: 'monospace', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{status}</p>}
    </div>
  )
}

function GameweekManager() {
  const [gameweeks, setGameweeks] = useState([])
  const [generating, setGenerating] = useState(false)
  const [status, setStatus] = useState(null)

  async function load() {
    const res = await fetch('/api/fantasy/gameweeks')
    const data = await res.json()
    setGameweeks(data.gameweeks ?? [])
  }

  useEffect(() => { load() }, [])

  async function generate() {
    setGenerating(true)
    setStatus(null)
    try {
      const res = await fetch('/api/fantasy/gameweeks/generate')
      const data = await res.json()
      if (data.ok) { setStatus(`✅ ${data.gameweeks.length}GW生成完了`); setGameweeks(data.gameweeks) }
      else setStatus(`❌ ${data.error}`)
    } catch (e) {
      setStatus(`❌ ${e.message}`)
    } finally {
      setGenerating(false)
    }
  }

  async function changeStatus(id, newStatus) {
    await fetch('/api/fantasy/gameweeks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: newStatus }),
    })
    load()
  }

  const statusColors = { upcoming: '#888', active: '#00ff87', finished: '#555' }
  const statusLabels = { upcoming: '未開始', active: '開催中', finished: '終了' }

  return (
    <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>ファンタジーGW管理</p>
        <button onClick={generate} disabled={generating} style={{
          padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
          backgroundColor: generating ? 'var(--bg-tertiary)' : 'var(--accent)',
          color: '#000', border: 'none', cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.6 : 1,
        }}>{generating ? '生成中…' : '自動生成'}</button>
      </div>
      {status && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>{status}</p>}
      {gameweeks.length === 0
        ? <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>GWがありません。自動生成してください。</p>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {gameweeks.map(gw => (
              <div key={gw.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, backgroundColor: 'var(--bg-tertiary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', width: 40 }}>GW{gw.gw_number}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{gw.start_date?.slice(0, 10)} 〜 {gw.end_date?.slice(0, 10)}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{gw.fixture_count}試合</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: statusColors[gw.status] }}>{statusLabels[gw.status] ?? gw.status}</span>
                  <select value={gw.status} onChange={e => changeStatus(gw.id, e.target.value)} style={{
                    fontSize: 11, padding: '2px 6px', borderRadius: 4,
                    backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', cursor: 'pointer',
                  }}>
                    <option value="upcoming">未開始</option>
                    <option value="active">開催中</option>
                    <option value="finished">終了</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  )
}

function BackupSync() {
  const [open, setOpen] = useState(false)
  const [gameweeks, setGameweeks] = useState([])
  const [selectedGw, setSelectedGw] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)

  useEffect(() => {
    fetch('/api/fantasy/gameweeks').then(r => r.json()).then(d => {
      const gws = d.gameweeks ?? []
      setGameweeks(gws)
      if (gws.length) setSelectedGw(String(gws.at(-1).id))
    })
  }, [])

  async function takeSnapshot() {
    if (!selectedGw) return
    setLoading(true)
    setStatus(null)
    try {
      const res = await fetch('/api/fantasy/gw-starters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameweek_id: Number(selectedGw) }),
      })
      const data = await res.json()
      setStatus(data.ok ? `✅ ${JSON.stringify(data)}` : `❌ ${data.error}`)
    } catch (e) {
      setStatus(`❌ ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden' }}>
      <button onClick={() => setOpen(v => !v)} style={{
        width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: 'var(--bg-secondary)', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12,
      }}>
        <span>予備（GitHub自動化済み）</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, backgroundColor: 'var(--bg-primary)' }}>
          <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>スタメンSnapshot（手動）</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>対象GW</span>
              <select value={selectedGw} onChange={e => setSelectedGw(e.target.value)} style={{
                fontSize: 12, padding: '4px 8px', borderRadius: 4,
                backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)',
              }}>
                {gameweeks.map(gw => <option key={gw.id} value={gw.id}>GW{gw.gw_number}</option>)}
              </select>
              <button onClick={takeSnapshot} disabled={loading || !selectedGw} style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                backgroundColor: loading ? 'var(--bg-tertiary)' : 'var(--accent)',
                color: '#000', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
              }}>{loading ? '実行中…' : 'スタメンSnapshot'}</button>
            </div>
            {status && <p style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{status}</p>}
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>通常はauto-processが締め切り後に自動取得</p>
          </div>
          <SyncButton label="試合日程・結果を同期" endpoint="/api/sync/fixtures" description="30分ごとに自動実行中" />
          <SyncButton label="試合詳細データを同期（10試合ずつ）" endpoint="/api/sync/fixture-details" description="30分ごとに自動実行中。複数回押してください。" />
          <SyncButton label="開催前試合のオッズを同期" endpoint="/api/sync/odds" description="自動実行中" />
        </div>
      )}
    </div>
  )
}

export default function AdminPage() {
  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>管理</h1>
      <div className="flex flex-col gap-3">
        <UnregisteredPlayersCheck />
        <FantasyGwActions />
        <GameweekManager />
        <BackupSync />
      </div>
    </div>
  )
}
