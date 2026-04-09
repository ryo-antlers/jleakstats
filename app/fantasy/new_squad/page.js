'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import FantasyLoading from '../FantasyLoading'

const POSITIONS = ['GK', 'DF', 'MF', 'FW']
const POS_LIMITS = { GK: 2, DF: 6, MF: 6, FW: 4 }
const POS_MIN = { GK: 1, DF: 3, MF: 4, FW: 1 }

// 予算: 1unit = 1000円 → 億/万表記
function formatBudget(value) {
  const yen = value * 1000
  const oku = Math.floor(yen / 100000000)
  const man = Math.floor((yen % 100000000) / 10000)
  if (oku === 0) return `${man}万`
  if (man === 0) return `${oku}億`
  return `${oku}億${man}万`
}

// 価格: 1unit = 1万円 → 億/万表記
function formatPrice(value) {
  if (!value) return '-'
  if (value >= 10000) {
    const oku = Math.floor(value / 10000)
    const man = value % 10000
    if (man === 0) return `${oku}億`
    return `${oku}億${man}万`
  }
  return `${value}万`
}


function textColor(hex) {
  if (!hex) return '#fff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? '#fff' : '#000'
}

export default function NewSquadPage() {
  const router = useRouter()
  const [players, setPlayers] = useState([])
  const [squad, setSquad] = useState([])
  const [user, setUser] = useState(null)
  const [posTab, setPosTab] = useState('GK')
  const [teamFilter, setTeamFilter] = useState('ALL')
  const [nameFilter, setNameFilter] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [mainTab, setMainTab] = useState('candidates')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null) // player_id or 'remove_xxx'
  const [message, setMessage] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/fantasy/players').then(r => r.json()),
      fetch('/api/fantasy/squad').then(r => r.json()),
      fetch('/api/fantasy/me').then(r => r.json()),
    ]).then(([p, s, u]) => {
      if (!u.user) { router.push('/fantasy/setup'); return }
      setPlayers(p.players ?? [])
      setSquad(s.squad ?? [])
      setUser(u.user)
    }).finally(() => setLoading(false))
  }, [])

  const squadIds = new Set(squad.map(s => s.player_id))
  const posCounts = {}
  const clubCounts = {}
  const posColors = {}  // ポジションごとのクラブカラー一覧
  for (const s of squad) {
    posCounts[s.position] = (posCounts[s.position] ?? 0) + 1
    clubCounts[s.team_abbr] = (clubCounts[s.team_abbr] ?? 0) + 1
    if (!posColors[s.position]) posColors[s.position] = []
    posColors[s.position].push(s.team_color ?? '#555')
  }

  // sort順でJ1クラブを重複なく並べる
  const clubTeams = [...new Map(
    players
      .filter(p => p.team_abbr)
      .sort((a, b) => (a.team_sort ?? 99) - (b.team_sort ?? 99))
      .map(p => [p.team_abbr, { abbr: p.team_abbr, color: p.team_color }])
  ).values()]
  const filtered = players.filter(p => {
    if (p.position !== posTab) return false
    if (teamFilter !== 'ALL' && p.team_abbr !== teamFilter) return false
    if (nameFilter) {
      const q = nameFilter.toLowerCase()
      if (!(p.name_ja ?? '').includes(nameFilter) && !(p.name_en ?? '').toLowerCase().includes(q)) return false
    }
    if (priceMin !== '' && (p.price ?? 0) < Number(priceMin)) return false
    if (priceMax !== '' && (p.price ?? 0) > Number(priceMax)) return false
    return true
  })
  const PAGE_SIZE = 20
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pagedPlayers = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const gkCount = posCounts['GK'] ?? 0
  const minTotal = 10 + gkCount  // GK1人なら11人、GK2人なら12人
  const minMet = POSITIONS.every(pos => (posCounts[pos] ?? 0) >= POS_MIN[pos]) && squad.length >= minTotal

  async function addPlayer(player) {
    setActionLoading(player.id)
    setMessage(null)
    const cost = player.price * 10
    // 楽観的更新
    const optimisticEntry = {
      player_id: player.id, bought_price: player.price, is_starter: false,
      name_ja: player.name_ja, name_en: player.name_en, position: player.position,
      price: player.price, team_id: player.team_id, no: player.no,
      team_abbr: player.team_abbr, team_color: player.team_color,
    }
    setSquad(prev => [...prev, optimisticEntry])
    setUser(prev => ({ ...prev, budget: Number(prev.budget) - cost }))

    const res = await fetch('/api/fantasy/squad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: player.id }),
    })
    const data = await res.json()
    if (!res.ok) {
      // 失敗時は元に戻す
      setSquad(prev => prev.filter(s => s.player_id !== player.id))
      setUser(prev => ({ ...prev, budget: Number(prev.budget) + cost }))
      setMessage({ type: 'error', text: data.error })
    }
    setActionLoading(null)
  }

  async function removePlayer(player) {
    setActionLoading('remove_' + player.player_id)
    setMessage(null)
    const refund = player.bought_price * 10

    const res = await fetch('/api/fantasy/squad', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: player.player_id, no_fee: true }),
    })
    const data = await res.json()
    if (!res.ok) {
      setMessage({ type: 'error', text: data.error })
    } else {
      setSquad(prev => prev.filter(s => s.player_id !== player.player_id))
      setUser(prev => ({ ...prev, budget: Number(prev.budget) + refund }))
    }
    setActionLoading(null)
  }

  if (loading) return <FantasyLoading />

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', minHeight: '100vh' }}>

      {/* 固定ヘッダーエリア */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backgroundColor: 'var(--bg-primary)',
        marginTop: -24, paddingTop: 24,
        marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16,
      }}>
        {/* 残金 + 確定ボタン + ポジション枠 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'start', paddingTop: 16, paddingBottom: 12, gap: 16 }}>
          <div>
            <p style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 2 }}>移籍資金</p>
            <p style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1, marginBottom: 8 }}>
              ¥{formatBudget(user?.budget ?? 0)}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {[
                'GK1-2、DF3-6、MF4-6、FW1-4、合計11人以上（GK2人の場合は12人以上）',
                '同じクラブからの獲得は最大3名まで',
              ].map((rule, i) => (
                <p key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <span style={{ color: 'var(--accent)', marginRight: 5 }}>·</span>{rule}
                </p>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <button
              onClick={async () => {
                if (!minMet) return
                setActionLoading('confirm')
                try {
                  await fetch('/api/fantasy/squad/auto-starters', { method: 'POST' })
                } catch {}
                setActionLoading(null)
                router.push('/fantasy')
              }}
              disabled={!minMet || actionLoading !== null}
              style={{
                padding: '10px 20px', borderRadius: 0, fontSize: 13, fontWeight: 700,
                backgroundColor: minMet ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: minMet ? '#000' : 'var(--text-secondary)',
                cursor: minMet ? 'pointer' : 'not-allowed',
                border: 'none', whiteSpace: 'nowrap',
              }}
            >
              {actionLoading === 'confirm' ? (
                <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #000', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
              ) : 'メンバー確定'}
            </button>
            {/* ポジション枠 */}
            <div style={{ display: 'flex', gap: 8 }}>
              {POSITIONS.map(pos => {
                const cnt = posCounts[pos] ?? 0
                const limit = POS_LIMITS[pos]
                const min = POS_MIN[pos]
                const full = cnt >= limit
                const minOk = cnt >= min
                const colors = posColors[pos] ?? []
                return (
                  <div key={pos} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: minOk ? '#fff' : 'var(--text-secondary)' }}>{pos}</span>
                    <div style={{ display: 'flex', gap: 2, position: 'relative' }}>
                      {Array.from({ length: limit }).map((_, i) => (
                        <div key={i} style={{ position: 'relative', width: 14, height: 14 }}>
                          <div style={{ width: 14, height: 14, backgroundColor: colors[i] ?? 'var(--bg-tertiary)', border: `1px solid ${colors[i] ? colors[i] : 'var(--border-color)'}` }} />
                          {/* 最小ラインマーカー: min番目のマスの右端に縦線 */}
                          {i === min - 1 && (
                            <div style={{ position: 'absolute', right: -3, top: 0, bottom: 0, width: 2, backgroundColor: minOk ? 'var(--accent)' : '#e55', borderRadius: 1 }} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* メインタブ */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
          {[
            { key: 'candidates', label: '獲得候補' },
            { key: 'squad', label: `現在のスカッド (${squad.length})` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setMainTab(t.key)}
              style={{
                padding: '10px 20px', fontSize: 13,
                fontWeight: mainTab === t.key ? 700 : 400,
                color: mainTab === t.key ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: 'none', border: 'none',
                borderBottom: mainTab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer', marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <p style={{ fontSize: 12, margin: '8px 0 0', padding: '8px 12px', borderRadius: 6, backgroundColor: message.type === 'error' ? '#3a1a1a' : '#1a3a1a', color: message.type === 'error' ? '#e55' : '#5e5' }}>
          {message.text}
        </p>
      )}

      {/* 獲得候補 */}
      {mainTab === 'candidates' && (
        <div style={{ marginTop: 16 }}>
          {/* ポジションタブ */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 10 }}>
            {POSITIONS.map(pos => (
              <button
                key={pos}
                onClick={() => { setPosTab(pos); setPage(0) }}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 0, fontSize: 12, fontWeight: 600,
                  backgroundColor: posTab === pos ? 'var(--accent)' : 'var(--bg-secondary)',
                  color: posTab === pos ? '#000' : 'var(--text-secondary)',
                  border: '1px solid var(--border-color)', cursor: 'pointer',
                }}
              >
                {pos}
              </button>
            ))}
          </div>

          {/* チームフィルター 3段 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
            {/* ALL */}
            <button
              onClick={() => { setTeamFilter('ALL'); setPage(0) }}
              style={{
                width: '100%', padding: '4px 0', borderRadius: 4, fontSize: 11,
                backgroundColor: teamFilter === 'ALL' ? 'var(--bg-tertiary)' : 'transparent',
                color: teamFilter === 'ALL' ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: '1px solid var(--border-color)', cursor: 'pointer', fontWeight: teamFilter === 'ALL' ? 600 : 400,
              }}
            >
              ALL
            </button>
            {/* 1-10 */}
            <div style={{ display: 'flex', gap: 4 }}>
              {clubTeams.slice(0, 10).map(t => {
                const active = teamFilter === t.abbr
                const full = (clubCounts[t.abbr] ?? 0) >= 3
                return (
                  <button
                    key={t.abbr}
                    onClick={() => { setTeamFilter(t.abbr); setPage(0) }}
                    style={{
                      flex: 1, padding: '3px 0', borderRadius: 4, fontSize: 10,
                      backgroundColor: active ? (t.color ?? 'var(--bg-tertiary)') : 'transparent',
                      color: active ? textColor(t.color) : 'var(--text-secondary)',
                      border: '1px solid var(--border-color)',
                      cursor: 'pointer', fontWeight: active ? 700 : 400,
                    }}
                  >
                    {t.abbr}{full ? ' ✕' : ''}
                  </button>
                )
              })}
            </div>
            {/* 11-20 */}
            <div style={{ display: 'flex', gap: 4 }}>
              {clubTeams.slice(10).map(t => {
                const active = teamFilter === t.abbr
                const full = (clubCounts[t.abbr] ?? 0) >= 3
                return (
                  <button
                    key={t.abbr}
                    onClick={() => { setTeamFilter(t.abbr); setPage(0) }}
                    style={{
                      flex: 1, padding: '3px 0', borderRadius: 4, fontSize: 10,
                      backgroundColor: active ? (t.color ?? 'var(--bg-tertiary)') : 'transparent',
                      color: active ? textColor(t.color) : 'var(--text-secondary)',
                      border: '1px solid var(--border-color)',
                      cursor: 'pointer', fontWeight: active ? 700 : 400,
                    }}
                  >
                    {t.abbr}{full ? ' ✕' : ''}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 名前検索・移籍金フィルター */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              type="text"
              placeholder="名前検索"
              value={nameFilter}
              onChange={e => { setNameFilter(e.target.value); setPage(0) }}
              style={{
                flex: 6, minWidth: 0, padding: '6px 10px', fontSize: 12,
                backgroundColor: '#1a1a1a', color: '#fff',
                border: '1px solid #2a2a2a', outline: 'none',
              }}
            />
            <div style={{ flex: 4, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <input
                type="number"
                placeholder="最小"
                value={priceMin}
                onChange={e => { setPriceMin(e.target.value); setPage(0) }}
                style={{
                  flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 12,
                  backgroundColor: '#1a1a1a', color: '#fff',
                  border: '1px solid #2a2a2a', outline: 'none',
                }}
              />
              <span style={{ color: 'var(--text-secondary)', fontSize: 12, flexShrink: 0 }}>〜</span>
              <input
                type="number"
                placeholder="最大"
                value={priceMax}
                onChange={e => { setPriceMax(e.target.value); setPage(0) }}
                style={{
                  flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 12,
                  backgroundColor: '#1a1a1a', color: '#fff',
                  border: '1px solid #2a2a2a', outline: 'none',
                }}
              />
            </div>
          </div>

          {/* 選手リスト */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* ヘッダー */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'var(--bg-tertiary)' }}>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 112, whiteSpace: 'nowrap', textAlign: 'center' }}>直近5GW</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 40, whiteSpace: 'nowrap', textAlign: 'center' }}>次節</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 80, whiteSpace: 'nowrap', textAlign: 'center' }}>移籍金</span>
                <span style={{ width: 34 }} />
              </div>
            </div>

            {pagedPlayers.map(p => {
              const inSquad = squadIds.has(p.id)
              const posOver = (posCounts[p.position] ?? 0) >= POS_LIMITS[p.position]
              const budgetOver = (user?.budget ?? 0) < p.price * 10
              const squadFull = squad.length >= 18
              const clubOver = (clubCounts[p.team_abbr] ?? 0) >= 3
              const canAdd = !inSquad && !posOver && !budgetOver && !squadFull && !clubOver
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', opacity: inSquad ? 0.45 : 1 }}>
                  {/* 左：バッジ＋名前・クラブ */}
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 0, backgroundColor: p.team_color ?? '#555', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: textColor(p.team_color) }}>{p.no ?? ''}</span>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <Link href={`/player/${p.id}`} style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.06em', textDecoration: 'none' }}>{p.name_ja ?? p.name_en}</Link>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{p.team_name_ja ?? p.team_abbr}</div>
                    </div>
                  </div>
                  {/* 右：カテゴリー・順位・スタッツ＋価格＋ボタン */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
                    <div style={{ width: 112, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                      {p.recent_points?.length > 0
                        ? [...p.recent_points].reverse().map((pt, i) => (
                            <div key={i} style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                              backgroundColor: pt >= 6 ? '#2f9446' : pt >= 3 ? '#c2b13d' : '#bc353f',
                              color: '#fff',
                            }}>{pt}</div>
                          ))
                        : <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>-</span>
                      }
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 40, textAlign: 'center' }}>{p.next_opponent ?? '-'}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', width: 80, textAlign: 'left' }}>{formatPrice(p.price)}</span>
                    {String(actionLoading) === String(p.id) ? (
                      <button disabled style={{
                        width: 34, height: 34, borderRadius: '50%',
                        backgroundColor: p.team_color ?? '#555',
                        border: 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ display: 'inline-block', width: 14, height: 14, border: `2px solid ${textColor(p.team_color)}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                      </button>
                    ) : inSquad ? (
                      <span style={{ fontSize: 12, color: 'var(--accent)', width: 34, textAlign: 'center' }}>✓</span>
                    ) : (
                      <button
                        onClick={() => addPlayer(p)}
                        disabled={!canAdd || actionLoading !== null}
                        style={{
                          width: 34, padding: '4px 0', borderRadius: 40, fontSize: 16, fontWeight: 700,
                          backgroundColor: canAdd && actionLoading === null ? (p.team_color ?? '#555') : 'var(--bg-tertiary)',
                          color: canAdd && actionLoading === null ? textColor(p.team_color) : 'var(--text-secondary)',
                          cursor: canAdd && actionLoading === null ? 'pointer' : 'not-allowed', border: 'none',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          opacity: actionLoading !== null ? 0.4 : 1,
                        }}
                      >
                        ＋
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ページネーション */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 12, paddingBottom: 16 }}>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                style={{ fontSize: 12, padding: '4px 12px', borderRadius: 4, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: page === 0 ? 'var(--text-secondary)' : 'var(--text-primary)', cursor: page === 0 ? 'not-allowed' : 'pointer' }}
              >
                ←
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                style={{ fontSize: 12, padding: '4px 12px', borderRadius: 4, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: page >= totalPages - 1 ? 'var(--text-secondary)' : 'var(--text-primary)', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer' }}
              >
                →
              </button>
            </div>
          )}
        </div>
      )}

      {/* 現在のスカッド */}
      {mainTab === 'squad' && (() => {
        const playerMap = new Map(players.map(p => [p.id, p]))
        return (
          <div style={{ marginTop: 16 }}>
            {squad.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', padding: 40 }}>まだ選手がいません</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {/* ヘッダー */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'var(--bg-tertiary)' }}>
                  <div style={{ flex: 1 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 44, whiteSpace: 'nowrap', textAlign: 'center' }}>カテゴリー</span>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 36, whiteSpace: 'nowrap', textAlign: 'center' }}>次節</span>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 52, whiteSpace: 'nowrap', textAlign: 'center' }}>出場時間</span>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 52, whiteSpace: 'nowrap', textAlign: 'center' }}>平均評価点</span>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 72, whiteSpace: 'nowrap', textAlign: 'center' }}>移籍金</span>
                    <span style={{ width: 34 }} />
                  </div>
                </div>
                {POSITIONS.map(pos => {
                  const posPlayers = squad.filter(s => s.position === pos)
                  if (posPlayers.length === 0) return null
                  return (
                    <div key={pos}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', padding: '10px 12px 4px', textTransform: 'uppercase' }}>{pos}</p>
                      {posPlayers.map(p => {
                        const stats = playerMap.get(p.player_id) ?? {}
                        return (
                          <div key={p.player_id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', opacity: actionLoading !== null && String(actionLoading) !== 'remove_' + String(p.player_id) ? 0.4 : 1 }}>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                              <div style={{ width: 36, height: 36, borderRadius: 0, backgroundColor: p.team_color ?? '#555', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: textColor(p.team_color) }}>{stats.no ?? ''}</span>
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <Link href={`/player/${p.player_id}`} style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.06em', textDecoration: 'none' }}>{p.name_ja ?? p.name_en}</Link>
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{stats.team_name_ja ?? p.team_abbr}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                              <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 44, textAlign: 'center' }}>{stats.category ?? '-'}</span>
                              <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 36, textAlign: 'center' }}>{stats.next_opponent ?? '-'}</span>
                              <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 52, textAlign: 'center' }}>{stats.minutes ?? 0}</span>
                              <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 52, textAlign: 'center' }}>{stats.avg_rating ? Number(stats.avg_rating).toFixed(2) : '-'}</span>
                              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', width: 72, textAlign: 'left' }}>{formatPrice(p.bought_price)}</span>
                              <button
                                onClick={() => removePlayer(p)}
                                disabled={actionLoading !== null}
                                style={{
                                  width: 34, height: 34, borderRadius: '50%', fontSize: 16, fontWeight: 700,
                                  backgroundColor: p.team_color ?? '#555',
                                  color: textColor(p.team_color),
                                  cursor: actionLoading !== null ? 'not-allowed' : 'pointer', border: 'none', flexShrink: 0,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                              >
                                {String(actionLoading) === 'remove_' + String(p.player_id) ? (
                                  <span style={{ display: 'inline-block', width: 14, height: 14, border: `2px solid ${textColor(p.team_color)}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                                ) : '×'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
