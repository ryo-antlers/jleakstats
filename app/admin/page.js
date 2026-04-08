'use client'
import { useState, useEffect } from 'react'

function HistorySyncButton() {
  const [season, setSeason] = useState('2025')
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  async function run() {
    setLoading(true)
    setStatus(null)
    try {
      const res = await fetch(`/api/sync/fixtures-history?season=${season}`)
      const data = await res.json()
      setStatus(data.ok ? `✅ ${JSON.stringify(data)}` : `❌ ${data.error}`)
    } catch (e) {
      setStatus(`❌ ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      backgroundColor: 'var(--bg-secondary)',
      border: '1px solid var(--border-color)',
      borderRadius: '8px',
      padding: '16px',
    }}>
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>過去シーズンの試合データを取得</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>審判履歴表示用。スコア・審判名のみ取得。</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="number"
            value={season}
            onChange={e => setSeason(e.target.value)}
            min={2020}
            max={2025}
            disabled={loading}
            style={{
              width: 72, padding: '4px 8px', borderRadius: 4, fontSize: 13,
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
            }}
          />
          <button
            onClick={run}
            disabled={loading}
            className="text-sm px-4 py-1.5 rounded font-medium transition-opacity"
            style={{
              backgroundColor: loading ? 'var(--bg-tertiary)' : 'var(--accent)',
              color: '#000',
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '実行中…' : '実行'}
          </button>
        </div>
      </div>
      {status && (
        <p className="text-xs mt-2 font-mono break-all" style={{ color: 'var(--text-secondary)' }}>
          {status}
        </p>
      )}
    </div>
  )
}

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
    <div style={{
      backgroundColor: 'var(--bg-secondary)',
      border: '1px solid var(--border-color)',
      borderRadius: '8px',
      padding: '16px',
    }}>
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{label}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{description}</p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="shrink-0 text-sm px-4 py-1.5 rounded font-medium transition-opacity"
          style={{
            backgroundColor: loading ? 'var(--bg-tertiary)' : 'var(--accent)',
            color: '#000',
            opacity: loading ? 0.6 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '実行中…' : '実行'}
        </button>
      </div>
      {status && (
        <p className="text-xs mt-2 font-mono break-all" style={{ color: 'var(--text-secondary)' }}>
          {status}
        </p>
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

  const gwLabel = (gw) => `GW${gw.gw_number}`

  return (
    <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16 }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>ファンタジー手動操作</p>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>選手ポイント計算は自動。スナップショット・ユーザーポイント・移籍金変動は手動で。</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>対象GW</span>
        <select
          value={selectedGw}
          onChange={e => setSelectedGw(e.target.value)}
          style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
        >
          {gameweeks.map(gw => (
            <option key={gw.id} value={gw.id}>{gwLabel(gw)}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          { label: 'ユーザーPT付与', endpoint: '/api/fantasy/calc-user-points', desc: 'is_starter=trueの選手ポイントをtotal_pointsに加算' },
          { label: '移籍金変動', endpoint: '/api/fantasy/update-prices', desc: 'GWポイントに基づき価格更新' },
        ].map(({ label, endpoint, desc }) => (
          <button
            key={label}
            onClick={() => run(endpoint)}
            disabled={loading || !selectedGw}
            title={desc}
            style={{
              padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
              backgroundColor: loading ? 'var(--bg-tertiary)' : 'var(--accent)',
              color: '#000', border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {status && (
        <p style={{ fontSize: 11, marginTop: 10, fontFamily: 'monospace', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
          {status}
        </p>
      )}
    </div>
  )
}

function GameweekManager() {
  const [gameweeks, setGameweeks] = useState([])
  const [generating, setGenerating] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
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
      if (data.ok) {
        setStatus(`✅ ${data.gameweeks.length}GW生成完了`)
        setGameweeks(data.gameweeks)
      } else {
        setStatus(`❌ ${data.error}`)
      }
    } catch (e) {
      setStatus(`❌ ${e.message}`)
    } finally {
      setGenerating(false)
    }
  }

  async function calcPointsAll(untilGw) {
    setBackfilling(true)
    setStatus(null)
    try {
      const res = await fetch(`/api/fantasy/calc-points-all?until_gw=${untilGw}`)
      const data = await res.json()
      if (data.ok) {
        const summary = data.results.map(r => r.skipped ? `GW${r.gw}: スキップ` : `GW${r.gw}: ${r.players}選手`).join(' / ')
        setStatus(`✅ ポイント計算完了 ${summary}`)
      } else {
        setStatus(`❌ ${data.error}`)
      }
    } catch (e) {
      setStatus(`❌ ${e.message}`)
    } finally {
      setBackfilling(false)
    }
  }

  async function backfill(untilGw) {
    setBackfilling(true)
    setStatus(null)
    try {
      const res = await fetch(`/api/fantasy/backfill?until_gw=${untilGw}`)
      const data = await res.json()
      if (data.ok) {
        const summary = data.results.map(r => `GW${r.gw}: ${r.calc} / ${r.prices}`).join('\n')
        setStatus(`✅ 一括処理完了\n${summary}`)
      } else {
        setStatus(`❌ ${data.error}`)
      }
    } catch (e) {
      setStatus(`❌ ${e.message}`)
    } finally {
      setBackfilling(false)
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
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>ファンタジーGW管理</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>試合データからGWを自動生成・ステータス管理</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => calcPointsAll(9)}
            disabled={backfilling}
            style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, backgroundColor: backfilling ? 'var(--bg-tertiary)' : '#5a3a8a', color: '#fff', border: 'none', cursor: backfilling ? 'not-allowed' : 'pointer', opacity: backfilling ? 0.6 : 1 }}
          >
            {backfilling ? '処理中…' : 'GW1〜9 ポイント計算'}
          </button>
          <button
            onClick={() => backfill(9)}
            disabled={backfilling}
            style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, backgroundColor: backfilling ? 'var(--bg-tertiary)' : '#1a5a8a', color: '#fff', border: 'none', cursor: backfilling ? 'not-allowed' : 'pointer', opacity: backfilling ? 0.6 : 1 }}
          >
            {backfilling ? '処理中…' : 'GW1〜9 一括処理'}
          </button>
          <button
            onClick={generate}
            disabled={generating}
            style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, backgroundColor: generating ? 'var(--bg-tertiary)' : 'var(--accent)', color: '#000', border: 'none', cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.6 : 1 }}
          >
            {generating ? '生成中…' : '自動生成'}
          </button>
        </div>
      </div>

      {status && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>{status}</p>}

      {gameweeks.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>GWがありません。自動生成してください。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {gameweeks.map(gw => (
            <div key={gw.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, backgroundColor: 'var(--bg-tertiary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', width: 40 }}>GW{gw.gw_number}</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {gw.start_date?.slice(0, 10)} 〜 {gw.end_date?.slice(0, 10)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{gw.fixture_count}試合</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: statusColors[gw.status] }}>{statusLabels[gw.status] ?? gw.status}</span>
                <select
                  value={gw.status}
                  onChange={e => changeStatus(gw.id, e.target.value)}
                  style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', cursor: 'pointer' }}
                >
                  <option value="upcoming">未開始</option>
                  <option value="active">開催中</option>
                  <option value="finished">終了</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminPage() {
  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        データ同期 (管理)
      </h1>

      <div className="flex flex-col gap-3">
        <SyncButton
          label="試合日程・結果を同期"
          endpoint="/api/sync/fixtures"
          description="API-FOOTBALLから全節の試合データを取得・更新します"
        />
        <SyncButton
          label="順位表を同期"
          endpoint="/api/sync/standings"
          description="API-FOOTBALLから最新の順位表を取得・更新します"
        />
        <SyncButton
          label="試合詳細データを同期（10試合ずつ）"
          endpoint="/api/sync/fixture-details"
          description="スタッツ・タイムライン・選手評価・オッズを取得。スタッツ未取得の終了済み試合が対象。複数回押してください。"
        />
        <SyncButton
          label="開催前試合のオッズを同期"
          endpoint="/api/sync/odds"
          description="未開催試合のオッズをまとめて取得します"
        />
        <SyncButton
          label="選手マスタを同期（全チーム）"
          endpoint="/api/sync/players-master"
          description="全20チームの選手リストをAPI-FOOTBALLから取得してplayers_masterに登録します"
        />
        <HistorySyncButton />
        <GameweekManager />
        <FantasyGwActions />
      </div>

      <p className="text-xs mt-6" style={{ color: 'var(--text-secondary)' }}>
        ※ このページはローカル開発・初期データ投入用です。本番環境では定期的なcronジョブに置き換えてください。
      </p>
    </div>
  )
}


