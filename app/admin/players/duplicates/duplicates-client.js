'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { mergeCanonicals, skipDuplicate, reassignFixtureRecords } from './actions'

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

function ReassignRow({ canonicalId, sourcePlayerId, teamId, teamMap, apps, seasons, isCanonicalTeam }) {
  const [target, setTarget] = useState('')
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState(null)
  const team = teamMap[teamId]

  function onReassign() {
    if (!target.trim() || !/^-?\d+$/.test(target.trim())) {
      setStatus({ type: 'error', text: 'target id は数字' })
      return
    }
    if (!confirm(`#${sourcePlayerId} の ${team?.short_name ?? teamId} 記録 ${apps}件 を #${target} に reassign しますか?`)) return
    startTransition(async () => {
      const res = await reassignFixtureRecords({
        sourcePlayerId, teamId, targetPlayerId: Number(target.trim()),
        reason: 'duplicates_admin_reassign',
      })
      setStatus(res.ok ? { type: 'ok', text: res.message } : { type: 'error', text: res.error })
    })
  }

  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px',
      background: isCanonicalTeam ? 'rgba(61,158,80,0.08)' : 'rgba(0,0,0,0.2)',
      borderRadius: 4, marginBottom: 4,
    }}>
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)' }}>
        #{sourcePlayerId}
      </span>
      <span style={{ fontSize: 12, color: team?.color_primary ?? '#ccc', minWidth: 70 }}>
        {team?.short_name ?? `team_id=${teamId}`}
      </span>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
        {apps}試合 ({(seasons ?? []).join(',')})
      </span>
      {isCanonicalTeam && (
        <span style={{ fontSize: 9, color: '#3d9e50', padding: '1px 4px', background: 'rgba(61,158,80,0.2)', borderRadius: 2 }}>
          canonical 所属
        </span>
      )}
      <input
        type="text"
        placeholder="target id"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        style={{
          width: 90, padding: '4px 6px', fontSize: 11,
          background: 'rgba(0,0,0,0.4)', color: '#fff',
          border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3,
        }}
        disabled={pending}
      />
      <button
        onClick={onReassign}
        disabled={pending}
        style={{
          padding: '4px 10px', fontSize: 11, background: '#e67e22', color: '#fff',
          border: 'none', borderRadius: 3, cursor: pending ? 'wait' : 'pointer',
        }}
      >
        reassign
      </button>
      {status && (
        <span style={{ fontSize: 10, color: status.type === 'ok' ? '#3d9e50' : '#e74c3c', maxWidth: 400 }}>
          {status.text}
        </span>
      )}
    </div>
  )
}

function MultiTeamGroup({ canonical, teamMap }) {
  const canonicalTeam = teamMap[canonical.canonical_team_id]
  return (
    <div style={{ padding: 12, marginBottom: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>#{canonical.canonical_id}</span>
        <span style={{ fontSize: 14, color: '#fff', fontWeight: 600 }}>
          <Link href={`/player/${canonical.canonical_id}`} target="_blank" style={{ color: '#fff', textDecoration: 'none' }}>
            {canonical.name_ja}
          </Link>
        </span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
          現所属: {canonicalTeam?.short_name ?? `team_id=${canonical.canonical_team_id}`}
        </span>
      </div>
      <div style={{ marginLeft: 12 }}>
        {canonical.records.map((r, i) => (
          <ReassignRow
            key={i}
            canonicalId={canonical.canonical_id}
            sourcePlayerId={r.source_player_id}
            teamId={r.team_id}
            teamMap={teamMap}
            apps={r.apps}
            seasons={r.seasons}
            isCanonicalTeam={r.team_id === canonical.canonical_team_id}
          />
        ))}
      </div>
      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
        汚染記録 (誤マッチで別人の試合が混入) を target canonical に再割当てできます。
        移籍が正しい場合は何もしないで OK。
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
            1canonical が複数チームの fixture 記録あり (season≥2024)。シーズン中移籍なら正常、
            別人の試合が誤って混入してたら reassign で正しい canonical に再割当て。
          </p>
          {oneIdMultiTeams.length === 0 ? <p style={{ color: 'rgba(255,255,255,0.4)' }}>なし 🎉</p> :
            oneIdMultiTeams.map((c, i) => <MultiTeamGroup key={i} canonical={c} teamMap={teamMap} />)
          }
        </div>
      )}
    </div>
  )
}
