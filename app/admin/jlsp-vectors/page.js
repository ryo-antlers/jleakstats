'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CLUBS, BASE_VECTORS } from '@/lib/jlsp/clubs'
import { AXES } from '@/lib/jlsp/axes'

const VALUES = [-2, -1, 0, 1, 2]

function effective(clubId, axis, overrides) {
  const o = overrides[clubId]?.[axis]
  if (o !== undefined) return o
  return BASE_VECTORS[clubId][axis]
}

function chipColor(v) {
  if (v >= 2) return { bg: 'var(--accent)', color: '#000' }
  if (v === 1) return { bg: 'var(--accent-dark)', color: '#000' }
  if (v === 0) return { bg: '#6b7280', color: '#fff' }
  if (v === -1) return { bg: '#d946efaa', color: '#fff' }
  return { bg: '#d946ef', color: '#fff' }
}

function ClubRow({ club, overrides, saving, saved, onSet, onResetClub }) {
  const hasAnyOverride = Boolean(overrides[club.id])

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 transition-colors ${
        hasAnyOverride ? 'border-emerald-700' : 'border-zinc-800'
      }`}
      style={{ backgroundColor: 'var(--bg-secondary)' }}
    >
      <div className="flex items-center gap-3 mb-4">
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: club.color }}
        />
        <h3 className="font-bold text-white">{club.name}</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 shrink-0">
          {club.division} / {club.prefecture}
        </span>
        <div className="ml-auto flex items-center gap-2 text-xs">
          {saving && <span className="text-zinc-500">保存中…</span>}
          {saved && !saving && (
            <span style={{ color: 'var(--accent)' }}>✓ 保存</span>
          )}
          {hasAnyOverride && (
            <button
              type="button"
              onClick={onResetClub}
              className="text-zinc-500 hover:text-red-400"
            >
              基準値に戻す
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {AXES.map((axis) => {
          const current = effective(club.id, axis.id, overrides)
          const base = BASE_VECTORS[club.id][axis.id]
          const isOverride = overrides[club.id]?.[axis.id] !== undefined
          return (
            <div key={axis.id} className="text-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold w-16 shrink-0 text-white">{axis.label}</span>
                {isOverride && (
                  <span className="text-[10px] text-zinc-500">
                    (基準: {base > 0 ? '+' : ''}
                    {base})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap pl-16">
                <span className="text-[11px] text-fuchsia-400 w-16 sm:w-20 text-right shrink-0">
                  {axis.negative.letter} {axis.negative.name}
                </span>
                <div className="flex gap-1.5">
                  {VALUES.map((n) => {
                    const isSelected = current === n
                    const isBase = base === n
                    const chip = chipColor(n)
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => onSet(axis.id, n)}
                        style={
                          isSelected
                            ? { backgroundColor: chip.bg, color: chip.color }
                            : undefined
                        }
                        className={`relative w-10 h-9 rounded text-xs font-bold transition-all ${
                          isSelected ? '' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                        }`}
                      >
                        {n > 0 ? `+${n}` : n}
                        {isBase && !isSelected && (
                          <span className="absolute -top-1 -right-1 text-[8px] text-zinc-500">
                            ★
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
                <span
                  className="text-[11px] w-16 sm:w-20 shrink-0"
                  style={{ color: 'var(--accent)' }}
                >
                  {axis.positive.name} {axis.positive.letter}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function JlspVectorsAdmin() {
  const [overrides, setOverrides] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedDiv, setSelectedDiv] = useState('J1')
  const [savingMap, setSavingMap] = useState({})
  const [savedMap, setSavedMap] = useState({})

  useEffect(() => {
    fetch('/api/jlsp/vectors')
      .then((r) => r.json())
      .then((data) => {
        setOverrides(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const visibleClubs = useMemo(
    () => CLUBS.filter((c) => c.division === selectedDiv),
    [selectedDiv],
  )

  async function postVector(clubId, vector) {
    setSavingMap((p) => ({ ...p, [clubId]: true }))
    try {
      const res = await fetch('/api/jlsp/vectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clubId, vector }),
      })
      if (!res.ok) throw new Error('save failed')
      setSavedMap((p) => ({ ...p, [clubId]: Date.now() }))
      window.setTimeout(() => {
        setSavedMap((p) => {
          const next = { ...p }
          delete next[clubId]
          return next
        })
      }, 1500)
    } catch {
      setSavedMap((p) => {
        const next = { ...p }
        delete next[clubId]
        return next
      })
    } finally {
      setSavingMap((p) => {
        const next = { ...p }
        delete next[clubId]
        return next
      })
    }
  }

  function setAxis(clubId, axis, value) {
    const base = BASE_VECTORS[clubId][axis]
    const current = { ...(overrides[clubId] ?? {}) }
    if (value === base) {
      delete current[axis]
    } else {
      current[axis] = value
    }
    setOverrides((prev) => {
      const next = { ...prev }
      if (Object.keys(current).length === 0) {
        delete next[clubId]
      } else {
        next[clubId] = current
      }
      return next
    })
    postVector(clubId, current)
  }

  function resetClub(clubId) {
    if (!confirm('このクラブの override をすべて削除して基準値に戻しますか？')) return
    setOverrides((prev) => {
      const next = { ...prev }
      delete next[clubId]
      return next
    })
    postVector(clubId, {})
  }

  const totalOverridden = Object.keys(overrides).length

  if (loading) {
    return <div className="text-sm text-zinc-500">読み込み中…</div>
  }

  return (
    <div className="mx-auto max-w-4xl w-full">
      <div className="mb-4 flex items-center justify-between text-xs text-zinc-500">
        <Link href="/admin" className="hover:text-white">
          ← 管理
        </Link>
        <span className="text-zinc-600">/admin/jlsp-vectors</span>
      </div>

      <h1 className="text-2xl font-bold mb-2 text-white">クラブ別 4軸ベクトル編集</h1>
      <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
        各クラブの 4軸 (勝負観・組織観・経営観・熱狂度) を -2 〜 +2 で設定。
        チップをクリックすると即保存。<span className="text-zinc-500">★</span> は基準値
        (clubs.js のデフォルト)。 現在の override 件数:{' '}
        <span className="font-mono font-semibold text-zinc-200">{totalOverridden}</span> /{' '}
        {CLUBS.length}
      </p>

      <div className="flex gap-2 mb-6 border-b border-zinc-800">
        {['J1', 'J2', 'J3'].map((div) => {
          const count = CLUBS.filter((c) => c.division === div).length
          const overrideCount = CLUBS.filter(
            (c) => c.division === div && overrides[c.id],
          ).length
          const isSelected = selectedDiv === div
          return (
            <button
              key={div}
              type="button"
              onClick={() => setSelectedDiv(div)}
              style={
                isSelected ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined
              }
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                isSelected ? '' : 'border-transparent text-zinc-500 hover:text-white'
              }`}
            >
              {div}{' '}
              <span className="text-[10px] text-zinc-500">
                ({overrideCount}/{count})
              </span>
            </button>
          )
        })}
      </div>

      <div className="space-y-3">
        {visibleClubs.map((club) => (
          <ClubRow
            key={club.id}
            club={club}
            overrides={overrides}
            saving={Boolean(savingMap[club.id])}
            saved={Boolean(savedMap[club.id])}
            onSet={(axis, value) => setAxis(club.id, axis, value)}
            onResetClub={() => resetClub(club.id)}
          />
        ))}
      </div>
    </div>
  )
}
