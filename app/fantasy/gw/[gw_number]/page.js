'use client'
import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

const SECTIONS = [
  { key: 'points',          label: 'ファンタジーPT',        unit: 'pt',   confirmed: true },
  { key: 'budget_points',   label: '3000万以下 PT',         unit: 'pt',   confirmed: true },
  { key: 'rating',          label: 'レーティング',           unit: '',     val: 'avg_rating', decimals: 2 },
  { key: 'goals',           label: 'ゴール',                unit: '点'  },
  { key: 'assists',         label: 'アシスト',              unit: '本'  },
  { key: 'saves',           label: 'セーブ',                unit: '回'  },
  { key: 'duels_won',       label: 'デュエル勝利',           unit: '回'  },
  { key: 'passes_key',      label: 'キーパス',              unit: '本'  },
  { key: 'passes_accuracy', label: 'パス成功率(20本以上)',   unit: '%',    val: 'passes_accuracy', decimals: 1 },
  { key: 'tackles',         label: 'タックル',              unit: '回'  },
  { key: 'interceptions',   label: 'インターセプト',         unit: '回'  },
  { key: 'minutes',         label: '出場時間',              unit: '分'  },
]

function PlayerRow({ rank, player, valueKey, unit, decimals }) {
  const val = player[valueKey]
  const display = decimals ? Number(val).toFixed(decimals) : Math.round(Number(val))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', alignItems: 'center', padding: '7px 14px', borderTop: '1px solid var(--border-color)', backgroundColor: '#1a1a1a', gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: rank <= 3 ? 'var(--accent)' : 'var(--text-secondary)' }}>{rank}</span>
      <div style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {player.team_color && <div style={{ width: 4, height: 14, backgroundColor: player.team_color, borderRadius: 1, flexShrink: 0 }} />}
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {player.name_ja ?? player.name_en}
          </span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{player.team_name} · {player.position}</span>
      </div>
      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
        {display}{unit}
      </span>
    </div>
  )
}

function Section({ title, players, valueKey, unit, decimals, note }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <p style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>{title}</p>
        {note && <span style={{ fontSize: 10, color: '#888' }}>{note}</span>}
      </div>
      <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
        {players.length === 0 ? (
          <div style={{ padding: '16px 14px', backgroundColor: '#1a1a1a' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>データなし</span>
          </div>
        ) : players.map((p, i) => (
          <PlayerRow key={p.player_id ?? i} rank={i + 1} player={p} valueKey={valueKey} unit={unit} decimals={decimals} />
        ))}
      </div>
    </div>
  )
}

export default function GwSummaryPage() {
  const { gw_number } = useParams()
  const router = useRouter()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/fantasy/gw-summary?gw_number=${gw_number}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return }
        setData(d)
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [gw_number])

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 60px' }}>
        {/* ヘッダー */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <Link href="/fantasy" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 13 }}>← ファンタジー</Link>
          <span style={{ color: 'var(--text-secondary)' }}>/</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>GW{gw_number} まとめ</span>
          {data && !data.has_confirmed && (
            <span style={{ fontSize: 10, fontWeight: 700, backgroundColor: '#ff444433', color: '#ff6b6b', padding: '2px 8px', borderRadius: 4 }}>暫定</span>
          )}
        </div>

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <div style={{ width: 28, height: 28, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          </div>
        )}

        {error && (
          <p style={{ color: '#ff6b6b', fontSize: 13 }}>エラー: {error}</p>
        )}

        {data && (
          <>
            {SECTIONS.map(sec => {
              if (sec.confirmed && !data.has_confirmed) return null
              const players = data.rankings[sec.key] ?? []
              const valueKey = sec.val ?? sec.key
              return (
                <Section
                  key={sec.key}
                  title={sec.label}
                  players={players}
                  valueKey={valueKey}
                  unit={sec.unit}
                  decimals={sec.decimals}
                  note={sec.key === 'budget_points' ? 'GW開始時点の移籍金' : null}
                />
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
