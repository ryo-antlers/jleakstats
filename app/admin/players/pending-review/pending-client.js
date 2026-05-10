'use client'

import { useState, useTransition } from 'react'
import { resolveByJleagueId, skipPending } from './actions'

function PendingRow({ row, candidateMap }) {
  const [jleagueId, setJleagueId] = useState('')
  const [status, setStatus] = useState(null)
  const [pending, startTransition] = useTransition()

  function onResolve() {
    if (!jleagueId.trim()) {
      setStatus({ type: 'error', text: '7桁ID を入力してください' })
      return
    }
    startTransition(async () => {
      const res = await resolveByJleagueId({ pendingId: row.id, jleagueJpId: jleagueId.trim() })
      setStatus(res.ok ? { type: 'ok', text: res.message } : { type: 'error', text: res.error })
    })
  }

  function onSkip() {
    if (!confirm(`pending #${row.id} を skip しますか？`)) return
    startTransition(async () => {
      const res = await skipPending({ pendingId: row.id, reason: 'manual' })
      setStatus(res.ok ? { type: 'ok', text: res.message } : { type: 'error', text: res.error })
    })
  }

  const candidates = (row.candidate_canonicals ?? [])
    .map(id => candidateMap[id])
    .filter(Boolean)

  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
      <td style={{ padding: '12px 8px', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{row.id}</td>
      <td style={{ padding: '12px 8px', fontSize: 12 }}>
        <span style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
          {row.source}:{row.external_id}
        </span>
      </td>
      <td style={{ padding: '12px 8px', fontSize: 13, color: '#fff' }}>
        {row.observed_name ?? <em style={{ color: 'rgba(255,255,255,0.4)' }}>不明</em>}
      </td>
      <td style={{ padding: '12px 8px', fontSize: 12, color: row.team_color ?? '#ccc' }}>
        {row.team_short ?? row.team_name ?? '-'}
      </td>
      <td style={{ padding: '12px 8px', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
        {row.observed_dob
          ? new Date(new Date(row.observed_dob).getTime() + 9*3600*1000).toISOString().slice(0,10)
          : '-'}
      </td>
      <td style={{ padding: '12px 8px', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{row.reason}</td>
      <td style={{ padding: '12px 8px' }}>
        {candidates.length > 0 && (
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
            候補: {candidates.map(c => `${c.name_ja} (${c.team_short ?? '?'})`).join(' / ')}
          </div>
        )}
        <input
          type="text"
          placeholder="7桁J-League ID"
          value={jleagueId}
          onChange={(e) => setJleagueId(e.target.value)}
          style={{
            width: 120, padding: '6px 8px', fontSize: 12,
            background: 'rgba(0,0,0,0.4)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4,
          }}
          disabled={pending}
        />
        <button
          onClick={onResolve}
          disabled={pending}
          style={{
            marginLeft: 6, padding: '6px 12px', fontSize: 12,
            background: '#3d9e50', color: '#fff', border: 'none', borderRadius: 4,
            cursor: pending ? 'wait' : 'pointer',
          }}
        >
          紐付け
        </button>
        <button
          onClick={onSkip}
          disabled={pending}
          style={{
            marginLeft: 4, padding: '6px 8px', fontSize: 11,
            background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)',
            border: 'none', borderRadius: 4,
            cursor: pending ? 'wait' : 'pointer',
          }}
        >
          skip
        </button>
        {status && (
          <div style={{ marginTop: 6, fontSize: 11, color: status.type === 'ok' ? '#3d9e50' : '#e74c3c' }}>
            {status.text}
          </div>
        )}
      </td>
    </tr>
  )
}

export default function PendingReviewClient({ pending, candidateMap }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
            <th style={{ padding: '8px', textAlign: 'left', fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>#</th>
            <th style={{ padding: '8px', textAlign: 'left', fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>外部ID</th>
            <th style={{ padding: '8px', textAlign: 'left', fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>観測名</th>
            <th style={{ padding: '8px', textAlign: 'left', fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>チーム</th>
            <th style={{ padding: '8px', textAlign: 'left', fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>dob</th>
            <th style={{ padding: '8px', textAlign: 'left', fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>理由</th>
            <th style={{ padding: '8px', textAlign: 'left', fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>解決</th>
          </tr>
        </thead>
        <tbody>
          {pending.map(row => <PendingRow key={row.id} row={row} candidateMap={candidateMap} />)}
        </tbody>
      </table>
    </div>
  )
}
