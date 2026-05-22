'use client'

import { useMemo, useState } from 'react'

/**
 * フィルタ + 並び替え可能な海外組テーブル。
 *
 * - 国 / 元 J クラブ で絞り込み
 * - 名前 / 海外クラブ / 元 J クラブ / 直近シーズン で並び替え
 * - 行クリックで JLSP の結果ページや players_master 詳細へジャンプ (オプション)
 */
export default function OverseasPlayersClient({ rows }) {
  const [countryFilter, setCountryFilter] = useState('all')
  const [jTeamFilter, setJTeamFilter] = useState('all')
  const [sortKey, setSortKey] = useState('country')
  const [sortDir, setSortDir] = useState('asc')

  const countries = useMemo(
    () => Array.from(new Set(rows.map((r) => r.country))).sort(),
    [rows],
  )
  const jTeams = useMemo(
    () =>
      Array.from(
        new Set(rows.filter((r) => r.j_team_name).map((r) => r.j_team_name)),
      ).sort(),
    [rows],
  )

  const filtered = useMemo(() => {
    let out = rows.filter((r) => {
      if (countryFilter !== 'all' && r.country !== countryFilter) return false
      if (jTeamFilter === '__noj__' && r.j_team_id) return false
      if (jTeamFilter !== 'all' && jTeamFilter !== '__noj__' && r.j_team_name !== jTeamFilter) return false
      return true
    })
    const cmp = (a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      const get = (r) => {
        if (sortKey === 'name') return r.name_ja ?? r.name_en ?? ''
        if (sortKey === 'overseas') return `${r.country}/${r.overseas_club}`
        if (sortKey === 'jteam') return r.j_team_name ?? 'zzz'
        if (sortKey === 'season') return -1 * (r.latest_j_season ?? 0)
        return r.country
      }
      const av = get(a), bv = get(b)
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    }
    return out.sort(cmp)
  }, [rows, countryFilter, jTeamFilter, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  return (
    <div>
      {/* フィルタ */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <Selector
          label="国"
          value={countryFilter}
          onChange={setCountryFilter}
          options={[['all', `全て (${rows.length})`], ...countries.map((c) => [c, c])]}
        />
        <Selector
          label="元 J クラブ"
          value={jTeamFilter}
          onChange={setJTeamFilter}
          options={[
            ['all', `全て`],
            ['__noj__', `J 所属歴なし (${rows.filter((r) => !r.j_team_id).length})`],
            ...jTeams.map((t) => [t, t]),
          ]}
        />
        <div style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
          表示: {filtered.length} / {rows.length}
        </div>
      </div>

      {/* テーブル */}
      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
              <Th onClick={() => toggleSort('name')} active={sortKey === 'name'} dir={sortDir}>選手</Th>
              <Th onClick={() => toggleSort('overseas')} active={sortKey === 'overseas'} dir={sortDir}>海外クラブ</Th>
              <Th onClick={() => toggleSort('jteam')} active={sortKey === 'jteam'} dir={sortDir}>元 J クラブ</Th>
              <Th onClick={() => toggleSort('season')} active={sortKey === 'season'} dir={sortDir}>直近 J</Th>
              <Th>POS</Th>
              <Th>ID</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={`${r.canonical_id}-${r.api_football_id}`}
                style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
              >
                <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                  <div style={{ color: '#fff', fontWeight: 700 }}>{r.name_ja}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                    {r.name_en}
                    {r.dob && (
                      <span style={{ marginLeft: 6 }}>
                        {new Date(r.dob).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {r.overseas_logo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.overseas_logo} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                    )}
                    <span style={{ color: '#fff', fontWeight: 600 }}>{r.overseas_club}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                    {r.league_name} · <span style={{ opacity: 0.85 }}>{r.country_ja}</span>
                  </div>
                </td>
                <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                  {r.j_team_name ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 4,
                          height: 22,
                          background: r.j_team_color ?? '#71717a',
                          borderRadius: 2,
                        }}
                      />
                      <div>
                        <div style={{ color: '#fff', fontWeight: 600 }}>{r.j_team_name}</div>
                        {r.latest_j_team_sfix && r.latest_j_team_sfix !== r.j_team_name && (
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>
                            sfix: {r.latest_j_team_sfix}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>—</span>
                  )}
                </td>
                <td style={{ padding: '8px 10px', verticalAlign: 'top', color: 'rgba(255,255,255,0.8)' }}>
                  {r.latest_j_season ? (
                    <>
                      {r.latest_j_season}
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginLeft: 4 }}>
                        ({r.total_j_seasons}季)
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td style={{ padding: '8px 10px', verticalAlign: 'top', color: 'rgba(255,255,255,0.7)' }}>
                  {r.api_position ?? r.canonical_position ?? '—'}
                </td>
                <td style={{ padding: '8px 10px', verticalAlign: 'top', fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
                  {r.canonical_id}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Th({ children, onClick, active, dir }) {
  return (
    <th
      onClick={onClick}
      style={{
        padding: '8px 10px',
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: active ? '#fff' : 'rgba(255,255,255,0.55)',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      {children}
      {active && <span style={{ marginLeft: 4, opacity: 0.7 }}>{dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  )
}

function Selector({ label, value, onChange, options }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: '5px 8px',
          borderRadius: 4,
          background: 'rgba(255,255,255,0.06)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.15)',
          fontSize: 11,
        }}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v} style={{ color: '#000' }}>{l}</option>
        ))}
      </select>
    </label>
  )
}
