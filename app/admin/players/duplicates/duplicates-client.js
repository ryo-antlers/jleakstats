'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { mergeCanonicals, skipDuplicate } from './actions'

const fmtDob = (d) => d ? new Date(new Date(d).getTime() + 9*3600*1000).toISOString().slice(0,10) : '-'

function PlayerCard({ row, teamMap, isWinner, isExcluded, onPickWinner, onToggleExclude }) {
  const team = teamMap[row.team_id]
  const borderColor = isWinner ? '#3d9e50' : isExcluded ? '#888' : 'rgba(255,255,255,0.1)'
  const bgColor = isWinner ? 'rgba(61,158,80,0.15)' : isExcluded ? 'rgba(120,120,120,0.1)' : 'rgba(255,255,255,0.04)'
  const opacity = isExcluded ? 0.5 : 1
  return (
    <div
      style={{
        flex: 1, padding: 8, borderRadius: 6,
        background: bgColor,
        border: `2px solid ${borderColor}`,
        opacity,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>#{row.id}</span>
        {isWinner && <span style={{ fontSize: 10, color: '#3d9e50', fontWeight: 700 }}>WINNER</span>}
        {isExcluded && <span style={{ fontSize: 10, color: '#888', fontWeight: 700 }}>別人として残す</span>}
        {row.is_active && <span style={{ fontSize: 9, padding: '1px 4px', background: '#3d9e50', color: '#fff', borderRadius: 2 }}>active</span>}
      </div>
      <div style={{ fontSize: 13, color: '#fff', fontWeight: 600, marginBottom: 4 }}>
        <Link href={`/player/${row.id}`} target="_blank" style={{ color: '#fff', textDecoration: 'none' }}>
          {row.name_ja}
        </Link>
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
        {team ? <span style={{ color: team.color_primary }}>{team.short_name}</span> : '-'}
        {' / '}{row.position ?? '-'}{' / dob '}{fmtDob(row.dob)}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          onClick={onPickWinner}
          disabled={isExcluded}
          style={{
            flex: 1, padding: '4px 8px', fontSize: 10,
            background: isWinner ? '#3d9e50' : 'rgba(255,255,255,0.08)',
            color: isWinner ? '#fff' : 'rgba(255,255,255,0.7)',
            border: 'none', borderRadius: 3,
            cursor: isExcluded ? 'not-allowed' : 'pointer',
          }}
        >
          {isWinner ? '✓ winner' : 'winner にする'}
        </button>
        {!isWinner && (
          <button
            onClick={onToggleExclude}
            style={{
              padding: '4px 8px', fontSize: 10,
              background: isExcluded ? '#888' : 'rgba(255,255,255,0.08)',
              color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer',
            }}
          >
            {isExcluded ? '戻す' : '別人'}
          </button>
        )}
      </div>
    </div>
  )
}

function DuplicateGroup({ rows, teamMap }) {
  const [winnerId, setWinnerId] = useState(rows[0]?.id)
  const [excludedIds, setExcludedIds] = useState(new Set())
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState(null)

  const losers = rows.filter(r => r.id !== winnerId && !excludedIds.has(r.id))
  const excludedCount = excludedIds.size

  function toggleExclude(id) {
    setExcludedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function onMerge() {
    if (losers.length === 0) {
      setStatus({ type: 'error', text: 'merge する選手がいません' })
      return
    }
    const winnerName = rows.find(r => r.id === winnerId)?.name_ja
    const excludedNames = rows.filter(r => excludedIds.has(r.id)).map(r => `#${r.id}`).join(', ')
    const msg = excludedCount > 0
      ? `${losers.length}件を #${winnerId} (${winnerName}) に merge\n別人として残す: ${excludedNames}`
      : `${losers.length}件を #${winnerId} (${winnerName}) に merge`
    if (!confirm(msg)) return

    startTransition(async () => {
      const results = []
      for (const loser of losers) {
        const res = await mergeCanonicals({ winnerId, loserId: loser.id, reason: 'duplicates_admin' })
        results.push(res)
      }
      // 除外したIDは skip ログ
      if (excludedCount > 0) {
        await skipDuplicate({ ids: [winnerId, ...[...excludedIds]], reason: 'separated_during_merge' })
      }
      const failed = results.filter(r => !r.ok)
      setStatus(failed.length === 0
        ? { type: 'ok', text: `${results.length}件 merge 成功${excludedCount > 0 ? ` / ${excludedCount}件 別人として記録` : ''}` }
        : { type: 'error', text: `${failed.length}件失敗: ${failed[0].error}` }
      )
    })
  }

  function onSkipAll() {
    if (!confirm('このグループ全員を「別人」として記録しますか?(変更なし、ログのみ)')) return
    startTransition(async () => {
      const res = await skipDuplicate({ ids: rows.map(r => r.id), reason: 'all_separate' })
      setStatus(res.ok ? { type: 'ok', text: res.message } : { type: 'error', text: res.error })
    })
  }

  return (
    <div style={{ padding: 12, marginBottom: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        {rows.map(r => (
          <PlayerCard
            key={r.id}
            row={r}
            teamMap={teamMap}
            isWinner={r.id === winnerId}
            isExcluded={excludedIds.has(r.id)}
            onPickWinner={() => {
              setWinnerId(r.id)
              setExcludedIds(prev => { const n = new Set(prev); n.delete(r.id); return n })
            }}
            onToggleExclude={() => toggleExclude(r.id)}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={onMerge}
          disabled={pending || losers.length === 0}
          style={{ padding: '6px 12px', fontSize: 12, background: '#3d9e50', color: '#fff', border: 'none', borderRadius: 4, cursor: pending ? 'wait' : 'pointer' }}
        >
          {pending ? '処理中...' : `merge 実行 (${losers.length}件 → winner${excludedCount > 0 ? `, ${excludedCount}件除外` : ''})`}
        </button>
        <button
          onClick={onSkipAll}
          disabled={pending}
          style={{ padding: '6px 12px', fontSize: 12, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', border: 'none', borderRadius: 4, cursor: pending ? 'wait' : 'pointer' }}
        >
          全員別人
        </button>
        {status && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: status.type === 'ok' ? '#3d9e50' : '#e74c3c' }}>
            {status.text}
          </span>
        )}
      </div>
    </div>
  )
}

function MultiTeamGroup({ row, teamMap }) {
  const teams = (row.team_ids ?? []).map(id => teamMap[id]).filter(Boolean)
  return (
    <div style={{ padding: 12, marginBottom: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>#{row.canonical_id}</span>
        <span style={{ fontSize: 14, color: '#fff', fontWeight: 600 }}>
          <Link href={`/player/${row.canonical_id}`} target="_blank" style={{ color: '#fff', textDecoration: 'none' }}>
            {row.name_ja}
          </Link>
        </span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
          {row.position ?? '-'} / dob {fmtDob(row.dob)}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
        2026 シーズンの所属: {teams.map(t => (
          <span key={t.id} style={{ display: 'inline-block', padding: '2px 8px', marginRight: 4, background: t.color_primary, color: '#fff', borderRadius: 3 }}>
            {t.short_name}
          </span>
        ))}
      </div>
      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
        ※ シーズン中の移籍なら正常。別人共有疑いなら split 対応 (Phase 9b 予定、現状は記録のみ)
      </p>
    </div>
  )
}

export default function DuplicatesClient({ kanjiVariants, sameNameMulti, oneIdMultiTeams, teamMap }) {
  const [tab, setTab] = useState('kanji')

  const tabs = [
    { key: 'kanji', label: `① 異体字組 (${kanjiVariants.length})` },
    { key: 'same-name', label: `② 同名複数 active (${sameNameMulti.length})` },
    { key: 'multi-team', label: `③ 1ID複数チーム (${oneIdMultiTeams.length})` },
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: 16 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 16px', fontSize: 13, color: tab === t.key ? '#fff' : 'rgba(255,255,255,0.5)',
              background: 'transparent', border: 'none',
              borderBottom: tab === t.key ? '2px solid #3d9e50' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'kanji' && (
        <div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}>
            異体字違い (旧字体↔新字体) で別 canonical になってる組。同一人物なら merge してください。
          </p>
          {kanjiVariants.length === 0 ? <p style={{ color: 'rgba(255,255,255,0.4)' }}>なし 🎉</p> :
            kanjiVariants.map((g, i) => <DuplicateGroup key={i} rows={g.rows} teamMap={teamMap} />)
          }
        </div>
      )}

      {tab === 'same-name' && (
        <div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}>
            同一 name_ja で複数 canonical (active含む)。dob/team を確認して同一人物なら merge、別人なら「別人として残す」。
          </p>
          {sameNameMulti.length === 0 ? <p style={{ color: 'rgba(255,255,255,0.4)' }}>なし 🎉</p> :
            sameNameMulti.map((g, i) => <DuplicateGroup key={i} rows={g.rows} teamMap={teamMap} />)
          }
        </div>
      )}

      {tab === 'multi-team' && (
        <div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}>
            1つの canonical が同シーズン複数チームの fixture_lineups に登場。シーズン中移籍なら正常、
            別人共有なら split 必要 (現状は記録のみ)。
          </p>
          {oneIdMultiTeams.length === 0 ? <p style={{ color: 'rgba(255,255,255,0.4)' }}>なし 🎉</p> :
            oneIdMultiTeams.map((row, i) => <MultiTeamGroup key={i} row={row} teamMap={teamMap} />)
          }
        </div>
      )}
    </div>
  )
}
