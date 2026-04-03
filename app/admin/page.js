'use client'
import { useState } from 'react'

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
        <HistorySyncButton />
      </div>

      <p className="text-xs mt-6" style={{ color: 'var(--text-secondary)' }}>
        ※ このページはローカル開発・初期データ投入用です。本番環境では定期的なcronジョブに置き換えてください。
      </p>
    </div>
  )
}


