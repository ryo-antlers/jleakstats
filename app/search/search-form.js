'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

// J公式の表記順 (2026シーズン)
const TIER_ORDER = {
  1: ['鹿島', '水戸', '浦和', '千葉', '柏', 'FC東京', '東京V', '町田', '川崎F', '横浜FM',
      '清水', '名古屋', '京都', 'G大阪', 'C大阪', '神戸', '岡山', '広島', '福岡', '長崎'],
  2: ['札幌', '八戸', '仙台', '秋田', '山形', 'いわき', '栃木シティ', '大宮', '横浜FC', '湘南',
      '甲府', '新潟', '富山', '磐田', '藤枝', '徳島', '今治', '鳥栖', '大分', '宮崎'],
  3: ['福島', '栃木SC', '群馬', '相模原', '松本', '長野', '金沢', '岐阜', '滋賀', 'FC大阪',
      '奈良', '鳥取', '山口', '讃岐', '愛媛', '高知', '北九州', '熊本', '鹿児島', '琉球'],
}
const TIER_LABEL = { 1: 'J1', 2: 'J2', 3: 'J3' }

function findClubByKey(pool, key) {
  let c = pool.find(c => c.short_name === key)
  if (c) return c
  c = pool.find(c => c.name_ja === key)
  if (c) return c
  c = pool.find(c => (c.name_ja ?? '').startsWith(key))
  if (c) return c
  c = pool.find(c => (c.name_ja ?? '').includes(key))
  if (c) return c
  return null
}

export default function SearchForm({ teams, referees, initial }) {
  const router = useRouter()
  const [team1, setTeam1] = useState(initial.team1 ?? '')
  const [team2, setTeam2] = useState(initial.team2 ?? '')
  const [referee, setReferee] = useState(initial.referee ?? '')

  // J1/J2/J3 の順番でチームを並べる
  const tierGroups = useMemo(() => {
    const m = { 1: [], 2: [], 3: [] }
    const usedIds = new Set()
    for (const tier of [1, 2, 3]) {
      for (const key of TIER_ORDER[tier]) {
        const pool = teams.filter(c => !usedIds.has(c.id))
        const club = findClubByKey(pool, key)
        if (club) {
          m[tier].push(club)
          usedIds.add(club.id)
        }
      }
    }
    return m
  }, [teams])

  // フィルターが変わるたびにURL更新 (page=1 にリセット)
  function updateURL(next) {
    const params = new URLSearchParams()
    if (next.team1) params.set('team1', next.team1)
    if (next.team2) params.set('team2', next.team2)
    if (next.referee) params.set('referee', next.referee)
    const qs = params.toString()
    router.push(qs ? `/search?${qs}` : '/search')
  }

  function changeTeam1(v) { setTeam1(v); updateURL({ team1: v, team2, referee }) }
  function changeTeam2(v) { setTeam2(v); updateURL({ team1, team2: v, referee }) }
  function changeReferee(v) { setReferee(v); updateURL({ team1, team2, referee: v }) }

  function reset() {
    setTeam1(''); setTeam2(''); setReferee('')
    router.push('/search')
  }

  const hasAny = team1 || team2 || referee

  return (
    <div className="search-filter-row" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 18,
      marginBottom: 14,
    }}>
      <Field label="チーム1">
        <TeamSelect value={team1} onChange={changeTeam1} tierGroups={tierGroups} excludeId={team2} />
      </Field>
      <Field label="チーム2">
        <TeamSelect value={team2} onChange={changeTeam2} tierGroups={tierGroups} excludeId={team1} />
      </Field>
      <Field label="審判">
        <RefereeSelect
          value={referee}
          onChange={changeReferee}
          referees={referees}
        />
      </Field>

      {hasAny && (
        <div style={{
          gridColumn: '1 / -1',
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <button type="button" onClick={reset} style={ghostBtnStyle}>
            リセット
          </button>
        </div>
      )}
    </div>
  )
}

function RefereeSelect({ value, onChange, referees }) {
  // referees は page.js で tier ASC → 最新担当日 DESC に並べ済み
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={inputStyle}
    >
      <option value="" style={optionStyle}>指定なし</option>
      {referees.map(r => (
        <option key={r.name} value={r.name} style={optionStyle}>{r.name}</option>
      ))}
    </select>
  )
}

function TeamSelect({ value, onChange, tierGroups, excludeId }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={inputStyle}
    >
      <option value="" style={optionStyle}>指定なし</option>
      {[1, 2, 3].map(tier => {
        const list = tierGroups[tier]
        if (!list?.length) return null
        return (
          <optgroup key={tier} label={TIER_LABEL[tier]}>
            {list.map(t => (
              <option
                key={t.id}
                value={t.id}
                disabled={excludeId && String(t.id) === String(excludeId)}
                style={optionStyle}
              >
                {t.name_ja}
              </option>
            ))}
          </optgroup>
        )
      })}
    </select>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <label style={{
        fontSize: 10, color: 'rgba(255,255,255,0.55)',
        letterSpacing: '0.16em', fontWeight: 800,
        textTransform: 'uppercase',
      }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  border: '1px solid rgba(255,255,255,0.12)',
  backgroundColor: 'transparent',
  color: '#fff',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const ghostBtnStyle = {
  padding: '10px 16px',
  fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
  backgroundColor: 'transparent',
  border: '1px solid rgba(255,255,255,0.12)',
  color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
  fontFamily: 'inherit',
}

// ネイティブ select のドロップダウン項目用 (OS背景に対して文字色を黒に)
const optionStyle = {
  color: '#000',
  backgroundColor: '#fff',
}
