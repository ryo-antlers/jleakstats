'use client'
import { useActionState, useEffect, useMemo, useState } from 'react'
import { updateTeam } from './actions'

const LEAGUE_LABEL = {
  1: 'J1', 2: 'J2J3', 3: 'J3', 98: 'J1', 100: 'カップ',
}

function textColor(hex) {
  if (!hex) return '#fff'
  const h = String(hex).replace('#', '')
  if (h.length !== 6) return '#fff'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 150 ? '#1a1a1a' : '#fff'
}
const ensureHash = (c) => (c ? (c.startsWith('#') ? c : `#${c}`) : '#444444')

export default function TeamsEditor({ teams }) {
  const [filter, setFilter] = useState('all')   // all / unset / set
  const [search, setSearch] = useState('')
  const [leagueFilter, setLeagueFilter] = useState('all')  // all / J1 / J2J3 / その他

  const filtered = useMemo(() => {
    return teams.filter(t => {
      if (filter === 'unset' && t.color_primary && t.abbr) return false
      if (filter === 'set' && (!t.color_primary || !t.abbr)) return false
      if (search && !(t.name_ja ?? '').includes(search) && !(t.short_name ?? '').includes(search)) return false
      if (leagueFilter !== 'all') {
        const lg = LEAGUE_LABEL[t.league_id_2026] ?? 'その他'
        if (leagueFilter !== lg) return false
      }
      return true
    })
  }, [teams, filter, search, leagueFilter])

  const stats = useMemo(() => {
    const total = teams.length
    const noColor = teams.filter(t => !t.color_primary).length
    const noAbbr = teams.filter(t => !t.abbr).length
    return { total, noColor, noAbbr }
  }, [teams])

  return (
    <>
      {/* ステータス & フィルタ */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
        padding: 12, marginBottom: 16,
        backgroundColor: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
          全 {stats.total}件 / 色未設定 {stats.noColor}件 / 略称未設定 {stats.noAbbr}件
        </span>
        <div style={{ flex: 1 }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="チーム名で検索"
          style={inputStyle}
        />
        <select value={leagueFilter} onChange={e => setLeagueFilter(e.target.value)} style={selectStyle}>
          <option value="all">全リーグ</option>
          <option value="J1">J1</option>
          <option value="J2J3">J2J3</option>
          <option value="その他">その他/不参加</option>
        </select>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={selectStyle}>
          <option value="all">全件</option>
          <option value="unset">未設定のみ</option>
          <option value="set">設定済のみ</option>
        </select>
      </div>

      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
        表示中: {filtered.length}チーム
      </p>

      {/* チームグリッド */}
      <div style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      }}>
        {filtered.map(t => <TeamCard key={t.id} team={t} />)}
      </div>
    </>
  )
}

function TeamCard({ team }) {
  const [shortName, setShortName] = useState(team.short_name ?? '')
  const [abbr, setAbbr] = useState(team.abbr ?? '')
  const [color, setColor] = useState(ensureHash(team.color_primary))
  const [state, formAction, isPending] = useActionState(updateTeam, null)
  const [showSaved, setShowSaved] = useState(false)

  useEffect(() => {
    if (state?.success) {
      setShowSaved(true)
      const t = setTimeout(() => setShowSaved(false), 2000)
      return () => clearTimeout(t)
    }
  }, [state])

  const fg = textColor(color)
  const leagueLabel = LEAGUE_LABEL[team.league_id_2026] ?? null

  return (
    <form
      action={formAction}
      style={{
        backgroundColor: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        padding: 12,
      }}
    >
      <input type="hidden" name="id" value={team.id} />

      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {team.name_ja ?? team.name_en ?? '?'}
        </span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums' }}>
          #{team.id}
        </span>
        {leagueLabel && (
          <span style={{
            fontSize: 8, fontWeight: 800, letterSpacing: '0.08em',
            padding: '1px 5px',
            backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)',
          }}>{leagueLabel}{team.group_name ? ` ${team.group_name}` : ''}</span>
        )}
      </div>

      {/* プレビュー */}
      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em' }}>PREVIEW</span>
        <div style={{
          marginTop: 4,
          backgroundColor: color,
          height: 56, borderRadius: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 900, color: fg,
          letterSpacing: '0.06em',
          transition: 'background-color 0.2s ease',
        }}>
          {abbr || '---'}
        </div>
        <div style={{
          marginTop: 4,
          display: 'flex', gap: 6, fontSize: 10, color: 'rgba(255,255,255,0.6)',
        }}>
          <span>順位表行:</span>
          <span style={{
            padding: '1px 6px', backgroundColor: color, color: fg, fontWeight: 700,
          }}>{shortName || '?'}</span>
        </div>
      </div>

      {/* 入力 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Field label="short_name (順位表)">
          <input
            name="short_name"
            type="text"
            value={shortName}
            onChange={e => setShortName(e.target.value)}
            placeholder="鹿島"
            maxLength={20}
            style={inputStyle}
          />
        </Field>
        <Field label="abbr (略称、3文字程度)">
          <input
            name="abbr"
            type="text"
            value={abbr}
            onChange={e => setAbbr(e.target.value.toUpperCase())}
            placeholder="KSM"
            maxLength={6}
            style={inputStyle}
          />
        </Field>
        <Field label="color_primary">
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              style={{
                width: 36, height: 28, padding: 0, border: '1px solid rgba(255,255,255,0.15)',
                background: 'transparent', cursor: 'pointer',
              }}
            />
            <input
              name="color_primary"
              type="text"
              value={color}
              onChange={e => setColor(e.target.value)}
              placeholder="#8b1a1a"
              style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
            />
          </div>
        </Field>
      </div>

      {/* アクション */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <span style={{ fontSize: 10, color: showSaved ? '#4caf50' : state?.error ? '#ef5350' : 'rgba(255,255,255,0.4)' }}>
          {showSaved ? '✓ 保存しました' : state?.error ? `⚠ ${state.error}` : ''}
        </span>
        <button
          type="submit"
          disabled={isPending}
          style={{
            padding: '6px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em',
            backgroundColor: isPending ? 'rgba(76,175,80,0.4)' : '#4caf50',
            color: '#fff', border: 'none', cursor: isPending ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {isPending ? '保存中…' : '保存'}
        </button>
      </div>
    </form>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </span>
      {children}
    </label>
  )
}

const inputStyle = {
  padding: '6px 8px',
  backgroundColor: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#fff',
  fontSize: 12,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
}
const selectStyle = {
  ...inputStyle,
  cursor: 'pointer',
}
