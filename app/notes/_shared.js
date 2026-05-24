// 観戦ノート関連の定数と小さなユーティリティ
//   /notes と /notes/[fixture_id]、後段で /u/[id] からも参照する
//
// アイコンはサイトの他の場所と統一するため lucide-react を使用 (絵文字不可)。
// 各 _ICONS は React コンポーネントを返すので、利用側で <Icon size={...} /> として描画する。

import {
  MapPin, MonitorPlay, Tv, Moon,
  TrainFront, Car, Bus, Footprints, Plane,
  Goal, Armchair,
} from 'lucide-react'

export const WATCH_TYPE_LABELS = {
  stadium:  '現地',
  dazn:     'DAZN',
  tv:       'TV',
  no_watch: '観てない',
}

export const WATCH_TYPE_ICONS = {
  stadium:  MapPin,
  dazn:     MonitorPlay,
  tv:       Tv,
  no_watch: Moon,
}

export const ACCESS_LABELS = {
  train: '電車',
  car:   '車',
  bus:   'バス',
  walk:  '徒歩',
  other: 'その他',
}

export const ACCESS_ICONS = {
  train: TrainFront,
  car:   Car,
  bus:   Bus,
  walk:  Footprints,
  other: Plane,
}

export const SEAT_TYPE_LABELS = {
  goal_back: 'ゴール裏',
  reserved:  '指定席',
}

export const SEAT_TYPE_ICONS = {
  goal_back: Goal,
  reserved:  Armchair,
}

export function normalizeColor(raw) {
  if (!raw) return '#444'
  const v = String(raw).trim()
  if (!v) return '#444'
  return v.startsWith('#') ? v : `#${v}`
}

export function textOn(hex) {
  const h = (hex ?? '').replace('#', '')
  if (h.length < 6) return '#fff'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? '#fff' : '#000'
}

export function leagueLabel(leagueId) {
  switch (Number(leagueId)) {
    case 1: return 'J1'
    case 2: return 'J2'
    case 98: return '百年構想'
    case 100: return 'カップ'
    default: return ''
  }
}

export function formatJST(iso) {
  if (!iso) return ''
  const d = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}
