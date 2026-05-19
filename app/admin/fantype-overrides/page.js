'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CLUBS, BASE_VECTORS } from '@/lib/fantype/clubs'
import { QUESTIONS } from '@/lib/fantype/questions'
import { AXES } from '@/lib/fantype/axes'

const STEPS = [3, 2, 1, 0, -1, -2, -3]

function axisShort(axis) {
  switch (axis) {
    case 'shoubu':
      return '勝負'
    case 'soshiki':
      return '組織'
    case 'keiei':
      return '経営'
    case 'nekkyou':
      return '熱狂'
    default:
      return ''
  }
}

function defaultExpected(effectiveVector, q) {
  return effectiveVector[q.axis] * q.direction
}

export default function FantypeOverridesAdmin() {
  const [all, setAll] = useState({})
  const [vectorOverrides, setVectorOverrides] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState({})
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/fantype/overrides').then((r) => r.json()),
      fetch('/api/fantype/vectors').then((r) => r.json()),
    ])
      .then(([overridesData, vectorsData]) => {
        setAll(overridesData)
        setVectorOverrides(vectorsData)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (selectedId) {
      setDraft({ ...(all[selectedId] ?? {}) })
      setSavedMsg(null)
    } else {
      setDraft({})
    }
  }, [selectedId, all])

  const selectedClub = useMemo(
    () => CLUBS.find((c) => c.id === selectedId) ?? null,
    [selectedId],
  )

  // 基準ベクトルに /admin/fantype-vectors で設定された override を被せた「効果のあるベクトル」
  const effectiveVector = useMemo(() => {
    if (!selectedClub) return null
    return { ...BASE_VECTORS[selectedClub.id], ...(vectorOverrides[selectedClub.id] ?? {}) }
  }, [selectedClub, vectorOverrides])

  const dirty = useMemo(() => {
    if (!selectedId) return false
    const saved = all[selectedId] ?? {}
    const keys = new Set([...Object.keys(saved), ...Object.keys(draft)])
    for (const k of keys) {
      if (saved[k] !== draft[k]) return true
    }
    return false
  }, [draft, all, selectedId])

  const overrideCount = Object.keys(draft).length
  const selectedIdx = selectedId ? CLUBS.findIndex((c) => c.id === selectedId) : -1

  function tryNavigate(toId) {
    if (dirty) {
      const ok = confirm('未保存の変更があります。破棄して移動しますか？')
      if (!ok) return
    }
    setSelectedId(toId)
  }

  function setOverride(qid, val) {
    setDraft((prev) => ({ ...prev, [qid]: val }))
  }

  function clearOverride(qid) {
    setDraft((prev) => {
      const next = { ...prev }
      delete next[qid]
      return next
    })
  }

  function clearAll() {
    if (!confirm('このクラブの override をすべて削除しますか？')) return
    setDraft({})
  }

  async function save() {
    if (!selectedClub) return
    setSaving(true)
    setSavedMsg(null)
    try {
      const res = await fetch('/api/fantype/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clubId: selectedClub.id, overrides: draft }),
      })
      if (!res.ok) throw new Error('save failed')
      const fresh = await fetch('/api/fantype/overrides').then((r) => r.json())
      setAll(fresh)
      setSavedMsg('保存しました')
      window.setTimeout(() => setSavedMsg(null), 2200)
    } catch {
      setSavedMsg('保存に失敗')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-sm text-zinc-500">読み込み中…</div>
  }

  return (
    <div className="pb-32">
      <div className="mb-4 flex items-center justify-between text-xs text-zinc-500">
        <Link href="/admin" className="hover:text-white">
          ← 管理
        </Link>
        <span className="text-zinc-600">/admin/fantype-overrides</span>
      </div>

      <h1 className="text-2xl font-bold mb-2 text-white">クラブ別 override</h1>
      <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
        クラブごとに、各質問への「期待回答」を上書き設定します。
        <br />
        設定しない質問は <code className="text-xs bg-zinc-800 px-1 rounded">vector × direction</code>{' '}
        で自動算出されます。
      </p>

      <select
        value={selectedId ?? ''}
        onChange={(e) => tryNavigate(e.target.value || null)}
        className="w-full p-3 rounded-lg border border-zinc-700 bg-zinc-900 text-white text-sm mb-6"
      >
        <option value="">— クラブを選択 —</option>
        {['J1', 'J2', 'J3'].map((div) => (
          <optgroup key={div} label={div}>
            {CLUBS.filter((c) => c.division === div).map((c) => {
              const count = Object.keys(all[c.id] ?? {}).length
              return (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {count > 0 ? `  (${count}件設定済み)` : ''}
                </option>
              )
            })}
          </optgroup>
        ))}
      </select>

      {selectedClub && (
        <>
          <div
            className="rounded-2xl border border-zinc-800 p-5 mb-6"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            <div className="flex items-baseline gap-3 flex-wrap mb-2">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: selectedClub.color }}
              />
              <h2 className="text-xl font-bold text-white">{selectedClub.name}</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                {selectedClub.division} / {selectedClub.prefecture}
              </span>
            </div>
            <div className="text-xs text-zinc-500 flex flex-wrap gap-x-4 gap-y-1">
              {AXES.map((axis) => {
                const v = effectiveVector?.[axis.id] ?? 0
                const sign = v > 0 ? '+' : ''
                return (
                  <span key={axis.id}>
                    {axis.label}:{' '}
                    <span className="font-mono font-semibold text-zinc-300">
                      {sign}
                      {v}
                    </span>
                  </span>
                )
              })}
            </div>
          </div>

          <div className="space-y-3 mb-8">
            {QUESTIONS.map((q, i) => {
              const auto = defaultExpected(effectiveVector, q)
              const current = draft[q.id]
              const hasOverride = current !== undefined

              return (
                <div
                  key={q.id}
                  className={`rounded-xl border p-4 transition-colors ${
                    hasOverride ? 'border-emerald-700' : 'border-zinc-800'
                  }`}
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  <div className="flex items-baseline gap-2 mb-1 text-[10px]">
                    <span className="font-mono text-zinc-500">Q{i + 1}</span>
                    <span className="uppercase tracking-wider text-zinc-500">
                      {axisShort(q.axis)} {q.direction > 0 ? '+' : '−'}
                    </span>
                    <span className="ml-auto text-zinc-500">
                      自動:{' '}
                      <span className="font-mono">
                        {auto > 0 ? '+' : ''}
                        {auto}
                      </span>
                    </span>
                  </div>
                  <p className="text-sm font-medium mb-3 leading-relaxed text-white">
                    {q.statement}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {STEPS.map((n) => {
                      const isSelected = hasOverride && current === n
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setOverride(q.id, n)}
                          style={
                            isSelected
                              ? { backgroundColor: 'var(--accent)', color: '#000' }
                              : undefined
                          }
                          className={`min-w-[2.25rem] h-8 px-2 rounded text-xs font-bold transition-all ${
                            isSelected ? '' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                          }`}
                        >
                          {n > 0 ? `+${n}` : n}
                        </button>
                      )
                    })}
                    {hasOverride && (
                      <button
                        type="button"
                        onClick={() => clearOverride(q.id)}
                        className="text-xs text-zinc-500 hover:text-white ml-2"
                      >
                        クリア
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {overrideCount > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-zinc-500 hover:text-red-400 mb-4"
            >
              このクラブの override をすべて削除
            </button>
          )}
        </>
      )}

      {!selectedClub && (
        <div className="rounded-xl bg-zinc-900 p-12 text-center text-zinc-500 text-sm">
          上のドロップダウンからクラブを選んでください
        </div>
      )}

      {selectedClub && (
        <div className="fixed bottom-0 left-0 right-0 backdrop-blur border-t border-zinc-800" style={{ backgroundColor: 'rgba(17,17,17,0.95)' }}>
          <div className="mx-auto max-w-3xl w-full px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <div className="text-xs text-zinc-400">
              override:{' '}
              <span className="font-mono font-semibold text-zinc-200">{overrideCount}</span> /{' '}
              {QUESTIONS.length}
              {dirty && <span className="ml-2 text-amber-400">● 未保存</span>}
              {savedMsg && (
                <span className="ml-2" style={{ color: 'var(--accent)' }}>
                  {savedMsg}
                </span>
              )}
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (selectedIdx > 0) tryNavigate(CLUBS[selectedIdx - 1].id)
                }}
                disabled={selectedIdx <= 0}
                className="text-xs px-3 py-2 rounded-full border border-zinc-700 disabled:opacity-40 hover:bg-zinc-800 text-white"
              >
                ← 前
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedIdx < CLUBS.length - 1) tryNavigate(CLUBS[selectedIdx + 1].id)
                }}
                disabled={selectedIdx >= CLUBS.length - 1}
                className="text-xs px-3 py-2 rounded-full border border-zinc-700 disabled:opacity-40 hover:bg-zinc-800 text-white"
              >
                次 →
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !dirty}
                style={
                  saving || !dirty
                    ? { backgroundColor: '#333', color: '#666' }
                    : { backgroundColor: 'var(--accent)', color: '#000' }
                }
                className="text-sm px-5 py-2 rounded-full font-semibold transition-opacity hover:opacity-90"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
