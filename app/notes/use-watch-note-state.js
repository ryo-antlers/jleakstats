'use client'
// watch_notes の編集 state と save/delete を 1 つの hook に集約。
// 紙カードビュー (paper-view) など、NoteForm 以外でも使い回せるように切り出す。

import { useState } from 'react'

const TIMELINE_MAX_ENTRIES = 30

export function useWatchNoteState(fixtureId, initialNote) {
  const [watchType, setWatchType] = useState(initialNote?.watch_type ?? 'stadium')
  const [access, setAccess] = useState(initialNote?.access ?? '')
  const [seatType, setSeatType] = useState(initialNote?.seat_type ?? '')
  const [companion, setCompanion] = useState(initialNote?.companion ?? '')
  const [nextVisitMemo, setNextVisitMemo] = useState(initialNote?.next_visit_memo ?? '')
  const [departurePrefecture, setDeparturePrefecture] = useState(initialNote?.departure_prefecture ?? '')
  const [departureCity, setDepartureCity] = useState(initialNote?.departure_city ?? '')
  const [timeline, setTimeline] = useState(() => {
    const initial = Array.isArray(initialNote?.timeline) ? initialNote.timeline : []
    return initial.map(e => ({ time: String(e?.time ?? ''), text: String(e?.text ?? '') }))
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successFlash, setSuccessFlash] = useState(false)

  function addTimelineEntry() {
    if (timeline.length >= TIMELINE_MAX_ENTRIES) return
    setTimeline(prev => [...prev, { time: '', text: '' }])
  }
  function updateTimelineEntry(idx, patch) {
    setTimeline(prev => prev.map((e, i) => i === idx ? { ...e, ...patch } : e))
  }
  function removeTimelineEntry(idx) {
    setTimeline(prev => prev.filter((_, i) => i !== idx))
  }

  async function save({ onSuccess } = {}) {
    setError(null)
    setLoading(true)
    try {
      const cleanTimeline = timeline
        .map(e => ({ time: e.time.trim(), text: e.text.trim() }))
        .filter(e => e.time || e.text)
      const res = await fetch('/api/watch-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixture_id: fixtureId,
          watch_type: watchType,
          access: watchType === 'stadium' ? (access || null) : null,
          seat_type: watchType === 'stadium' ? (seatType || null) : null,
          companion: companion.trim() || null,
          next_visit_memo: nextVisitMemo.trim() || null,
          departure_prefecture: watchType === 'stadium' ? (departurePrefecture || null) : null,
          departure_city: watchType === 'stadium' && departurePrefecture && departureCity ? departureCity : null,
          timeline: cleanTimeline,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'エラーが発生しました')
        return false
      }
      setSuccessFlash(true)
      setTimeout(() => setSuccessFlash(false), 1500)
      onSuccess?.()
      return true
    } catch (err) {
      setError(`エラー: ${err?.message ?? String(err)}`)
      return false
    } finally {
      setLoading(false)
    }
  }

  async function deleteNote({ onSuccess } = {}) {
    if (!confirm('このノートを削除しますか？')) return false
    setLoading(true)
    try {
      const res = await fetch(`/api/watch-notes?fixture_id=${fixtureId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '削除に失敗しました')
        return false
      }
      onSuccess?.()
      return true
    } catch (err) {
      setError(`エラー: ${err?.message ?? String(err)}`)
      return false
    } finally {
      setLoading(false)
    }
  }

  return {
    watchType, access, seatType, companion, nextVisitMemo,
    departurePrefecture, departureCity, timeline,
    setWatchType, setAccess, setSeatType, setCompanion, setNextVisitMemo,
    setDeparturePrefecture, setDepartureCity,
    addTimelineEntry, updateTimelineEntry, removeTimelineEntry,
    loading, error, successFlash, setError,
    save, deleteNote,
  }
}

export const WATCH_NOTE_LIMITS = {
  COMPANION_MAX: 50,
  NEXT_VISIT_MEMO_MAX: 500,
  TIMELINE_MAX_ENTRIES,
  TIMELINE_TEXT_MAX: 100,
}
