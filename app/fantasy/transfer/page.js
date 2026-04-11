'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import FantasyLoading from '../FantasyLoading'

async function fetchIsMarketOpen() {
  try {
    const res = await fetch('/api/fantasy/gameweeks/schedule')
    const { gameweeks } = await res.json()
    const now = new Date()
    const gws = (gameweeks ?? [])
      .filter(gw => gw.deadline)
      .map(gw => ({ deadline: new Date(gw.deadline), marketOpen: gw.market_open ? new Date(gw.market_open) : null }))
    const pastGws = gws.filter(gw => gw.deadline <= now)
    if (pastGws.length === 0) return true
    const currentGw = pastGws[pastGws.length - 1]
    if (currentGw.marketOpen && now < currentGw.marketOpen) return false
    return true
  } catch { return true }
}

const POSITIONS = ['GK', 'DF', 'MF', 'FW']
const POS_LIMITS = { GK: 2, DF: 6, MF: 7, FW: 5 }
const POS_MIN = { GK: 1, DF: 4, MF: 4, FW: 1 }
const SELL_FEE = 0.05

function formatBudget(value) {
  const yen = value * 1000
  const oku = Math.floor(yen / 100000000)
  const man = Math.floor((yen % 100000000) / 10000)
  if (oku === 0) return `${man}万`
  if (man === 0) return `${oku}億`
  return `${oku}億${man}万`
}

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

function calcAge(dob) {
  if (!dob) return null
  const today = new Date()
  const birth = new Date(dob)
  let age = today.getFullYear() - birth.getFullYear()
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--
  return age
}

function textColor(hex) {
  if (!hex) return '#fff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? '#fff' : '#000'
}

export default function TransferPage() {
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
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [confirmPlayer, setConfirmPlayer] = useState(null) // 売却確認モーダル
  const [confirmBuyPlayer, setConfirmBuyPlayer] = useState(null) // 購入確認モーダル
  const [tooltip, setTooltip] = useState(null) // { id, msg }

  useEffect(() => {
    fetchIsMarketOpen().then(open => { if (!open) router.replace('/fantasy') })
  }, [])

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
  const posColors = {}
  for (const s of squad) {
    posCounts[s.position] = (posCounts[s.position] ?? 0) + 1
    clubCounts[s.team_abbr] = (clubCounts[s.team_abbr] ?? 0) + 1
    if (!posColors[s.position]) posColors[s.position] = []
    posColors[s.position].push(s.team_color ?? '#555')
  }

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

  const minMet = POSITIONS.every(pos => (posCounts[pos] ?? 0) >= POS_MIN[pos]) && squad.length >= 15

  async function addPlayer(player) {
    setActionLoading(true)
    setMessage(null)
    const cost = player.price * 10
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
      setSquad(prev => prev.filter(s => s.player_id !== player.id))
      setUser(prev => ({ ...prev, budget: Number(prev.budget) + cost }))
      setMessage({ type: 'error', text: data.error })
    }
    setActionLoading(false)
  }

  async function sellPlayer(player) {
    setActionLoading(true)
    setMessage(null)
    const sellPrice = Math.floor((player.bought_price ?? 0) * (1 - SELL_FEE))
    const refund = sellPrice * 10
    setSquad(prev => prev.filter(s => s.player_id !== player.player_id))
    setUser(prev => ({ ...prev, budget: Number(prev.budget) + refund }))

    const res = await fetch('/api/fantasy/squad', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: player.player_id }),
    })
    const data = await res.json()
    if (!res.ok) {
      setSquad(prev => [...prev, player])
      setUser(prev => ({ ...prev, budget: Number(prev.budget) - refund }))
      setMessage({ type: 'error', text: data.error })
    }
    setActionLoading(false)
  }

  if (loading) return <FantasyLoading />

  const confirmSellPrice = confirmPlayer ? Math.floor((confirmPlayer.bought_price ?? 0) * (1 - SELL_FEE)) : 0
  const confirmFee = confirmPlayer ? (confirmPlayer.bought_price ?? 0) - confirmSellPrice : 0

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', minHeight: '100vh' }}>

      {/* 売却確認モーダル */}
      {confirmPlayer && (
        <div
          onClick={() => setConfirmPlayer(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a',
              padding: '28px 24px', width: 300, maxWidth: '90vw',
            }}
          >
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>売却確認</p>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 20, letterSpacing: '0.04em' }}>
              {confirmPlayer.name_ja ?? confirmPlayer.name_en}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-secondary)' }}>移籍金</span>
                <span style={{ color: '#fff' }}>{formatPrice(confirmPlayer.bought_price)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-secondary)' }}>手数料 (5%)</span>
                <span style={{ color: '#ef5350' }}>-{formatPrice(confirmFee)}</span>
              </div>
              <div style={{ height: 1, backgroundColor: '#2a2a2a', margin: '4px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700 }}>
                <span style={{ color: 'var(--text-secondary)' }}>受取額</span>
                <span style={{ color: 'var(--accent)' }}>{formatPrice(confirmSellPrice)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setConfirmPlayer(null)}
                style={{
                  flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 600,
                  backgroundColor: '#2a2a2a', color: 'var(--text-secondary)',
                  border: 'none', cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
              <button
                onClick={() => { sellPlayer(confirmPlayer); setConfirmPlayer(null) }}
                disabled={actionLoading}
                style={{
                  flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 700,
                  backgroundColor: '#3d1010', color: '#ef5350',
                  border: '1px solid #ef5350', cursor: 'pointer',
                }}
              >
                売却する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 購入確認モーダル */}
      {confirmBuyPlayer && (
        <div
          onClick={() => setConfirmBuyPlayer(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a',
              padding: '28px 24px', width: 300, maxWidth: '90vw',
            }}
          >
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>獲得確認</p>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 20, letterSpacing: '0.04em' }}>
              {confirmBuyPlayer.name_ja ?? confirmBuyPlayer.name_en}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-secondary)' }}>移籍金</span>
                <span style={{ color: 'var(--accent)' }}>{formatPrice(confirmBuyPlayer.price)}</span>
              </div>
              <div style={{ height: 1, backgroundColor: '#2a2a2a', margin: '4px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-secondary)' }}>残高</span>
                <span style={{ color: '#fff' }}>{formatBudget(user?.budget ?? 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-secondary)' }}>獲得後の残高</span>
                <span style={{ color: '#fff' }}>{formatBudget((user?.budget ?? 0) - confirmBuyPlayer.price * 10)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setConfirmBuyPlayer(null)}
                style={{
                  flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 600,
                  backgroundColor: '#2a2a2a', color: 'var(--text-secondary)',
                  border: 'none', cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
              <button
                onClick={() => { addPlayer(confirmBuyPlayer); setConfirmBuyPlayer(null) }}
                disabled={actionLoading}
                style={{
                  flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 700,
                  backgroundColor: confirmBuyPlayer.team_color ?? 'var(--accent)',
                  color: textColor(confirmBuyPlayer.team_color),
                  border: 'none', cursor: 'pointer',
                }}
              >
                獲得する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 固定ヘッダー */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backgroundColor: 'var(--bg-primary)',
        marginTop: -24, paddingTop: 24,
        marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'start', paddingTop: 16, paddingBottom: 12, gap: 16 }}>
          <div>
            <p style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 2 }}>移籍資金</p>
            <p style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1, marginBottom: 8 }}>
              ¥{formatBudget(user?.budget ?? 0)}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {[
                'GK1-2、DF4-6、MF4-7、FW1-5、合計15人以上（最大20人）',
                '同じクラブからの獲得は最大3名まで',
                '売却時は移籍金の5%が手数料として差し引かれます',
              ].map((rule, i) => (
                <p key={i} style={{ fontSize: 11, color: i === 2 ? '#ef5350' : 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <span style={{ color: i === 2 ? '#ef5350' : 'var(--accent)', marginRight: 5 }}>·</span>{rule}
                </p>
              ))}
              <Link href="/fantasy/rules" style={{ fontSize: 11, color: 'var(--text-secondary)', opacity: 0.5, marginTop: 2, textDecoration: 'none' }}>
                ガイドを見る →
              </Link>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <button
              onClick={() => router.push('/fantasy')}
              style={{
                padding: '10px 20px', borderRadius: 0, fontSize: 13, fontWeight: 700,
                backgroundColor: 'var(--accent)', color: '#000',
                cursor: 'pointer', border: 'none', whiteSpace: 'nowrap',
              }}
            >
              完了
            </button>
            {/* ポジション枠 */}
            <div style={{ display: 'flex', gap: 8 }}>
              {POSITIONS.map(pos => {
                const cnt = posCounts[pos] ?? 0
                const limit = POS_LIMITS[pos]
                const min = POS_MIN[pos]
                const minOk = cnt >= min
                const colors = posColors[pos] ?? []
                return (
                  <div key={pos} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: minOk ? '#fff' : 'var(--text-secondary)' }}>{pos}</span>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {Array.from({ length: limit }).map((_, i) => (
                        <>
                          {i === min && (
                            <div key={`sep-${i}`} style={{ width: '1.2px', height: 22, backgroundColor: 'var(--accent)', margin: '0 3px' }} />
                          )}
                          <div key={i} style={{ width: 14, height: 14, backgroundColor: colors[i] ?? '#666666', marginLeft: i > 0 && i !== min ? 2 : 0 }} />
                        </>
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
        {/* ポジションタブ（candidates時のみ） */}
        {mainTab === 'candidates' && (
          <div style={{ display: 'flex', gap: 0, paddingBottom: 10, paddingTop: 4 }}>
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
        )}
      </div>

      {message && (
        <p style={{ fontSize: 12, margin: '8px 0 0', padding: '8px 12px', borderRadius: 6, backgroundColor: message.type === 'error' ? '#3a1a1a' : '#1a3a1a', color: message.type === 'error' ? '#e55' : '#5e5' }}>
          {message.text}
        </p>
      )}

      {/* 獲得候補 */}
      {mainTab === 'candidates' && (
        <div style={{ marginTop: 8 }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
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
            {[clubTeams.slice(0, 10), clubTeams.slice(10)].map((group, gi) => (
              <div key={gi} style={{ display: 'flex', gap: 4 }}>
                {group.map(t => {
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
            ))}
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

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'var(--bg-tertiary)' }}>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 112, textAlign: 'center' }}>直近5GW</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 40, textAlign: 'center' }}>次節</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 36, textAlign: 'center' }}>年齢</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 80, textAlign: 'center' }}>移籍金</span>
                <span style={{ width: 34 }} />
              </div>
            </div>

            {pagedPlayers.map(p => {
              const inSquad = squadIds.has(p.id)
              const posOver = (posCounts[p.position] ?? 0) >= POS_LIMITS[p.position]
              const budgetOver = (user?.budget ?? 0) < p.price * 10
              const squadFull = squad.length >= 20
              const clubOver = (clubCounts[p.team_abbr] ?? 0) >= 3
              const canAdd = !inSquad && !posOver && !budgetOver && !squadFull && !clubOver
              const disabledReason = inSquad ? null
                : clubOver ? 'このクラブの選手を既に3人保有しています'
                : posOver ? `${p.position}は最大${POS_LIMITS[p.position]}人まで獲得できます`
                : squadFull ? 'スカッドが満員です（最大20人）'
                : budgetOver ? '残高が不足しています'
                : null
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', opacity: inSquad ? 0.45 : 1 }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div style={{ width: 36, height: 36, backgroundColor: p.team_color ?? '#555', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: textColor(p.team_color) }}>{p.no ?? ''}</span>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <Link href={`/player/${p.id}`} style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.06em', textDecoration: 'none' }}>{p.name_ja ?? p.name_en}</Link>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{p.team_name_ja ?? p.team_abbr}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
                    <div style={{ width: 112, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                      {p.recent_points?.length > 0
                        ? [...p.recent_points].reverse().map((pt, i) => (
                            <div key={i} style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                              backgroundColor: pt >= 6 ? '#2f9446' : pt >= 3 ? '#c2b13d' : '#bc353f', color: '#fff',
                            }}>{pt}</div>
                          ))
                        : <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>-</span>
                      }
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 40, textAlign: 'center' }}>{p.next_opponent ?? '-'}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 36, textAlign: 'center' }}>{calcAge(p.dob) ?? '-'}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', width: 80, textAlign: 'left' }}>{formatPrice(p.price)}</span>
                    {inSquad ? (
                      <span style={{ fontSize: 12, color: 'var(--accent)', width: 34, textAlign: 'center' }}>✓</span>
                    ) : (
                      <div style={{ position: 'relative', width: 34, flexShrink: 0 }}>
                        <button
                          onClick={() => canAdd ? setConfirmBuyPlayer(p) : setTooltip(t => t?.id === p.id ? null : { id: p.id, msg: disabledReason })}
                          onMouseEnter={() => !canAdd && disabledReason && setTooltip({ id: p.id, msg: disabledReason })}
                          onMouseLeave={() => setTooltip(null)}
                          style={{
                            width: 34, padding: '4px 0', borderRadius: 40, fontSize: 16, fontWeight: 700,
                            backgroundColor: canAdd ? (p.team_color ?? '#555') : 'var(--bg-tertiary)',
                            color: canAdd ? textColor(p.team_color) : 'var(--text-secondary)',
                            cursor: canAdd ? 'pointer' : 'not-allowed', border: 'none',
                          }}
                        >
                          ＋
                        </button>
                        {tooltip?.id === p.id && (
                          <div style={{
                            position: 'absolute', right: 40, top: '50%', transform: 'translateY(-50%)',
                            backgroundColor: '#2a2a2a', border: '1px solid #3a3a3a',
                            padding: '6px 10px', fontSize: 11, color: '#ccc',
                            whiteSpace: 'nowrap', zIndex: 10, pointerEvents: 'none',
                          }}>
                            {tooltip.msg}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 12, paddingBottom: 16 }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 4, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: page === 0 ? 'var(--text-secondary)' : 'var(--text-primary)', cursor: page === 0 ? 'not-allowed' : 'pointer' }}>←</button>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{page + 1} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 4, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: page >= totalPages - 1 ? 'var(--text-secondary)' : 'var(--text-primary)', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer' }}>→</button>
            </div>
          )}
        </div>
      )}

      {/* 現在のスカッド（売却） */}
      {mainTab === 'squad' && (() => {
        const playerMap = new Map(players.map(p => [p.id, p]))
        return (
          <div style={{ marginTop: 16 }}>
            {squad.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', padding: 40 }}>まだ選手がいません</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'var(--bg-tertiary)' }}>
                  <div style={{ flex: 1 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 36, textAlign: 'center', whiteSpace: 'nowrap' }}>年齢</span>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 80, textAlign: 'center', whiteSpace: 'nowrap' }}>購入</span>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 80, textAlign: 'center', whiteSpace: 'nowrap' }}>現在</span>
                    <span style={{ width: 34 }} />
                  </div>
                </div>
                {POSITIONS.map(pos => {
                  const posPlayers = squad.filter(s => s.position === pos)
                  if (posPlayers.length === 0) return null
                  const atMin = (posCounts[pos] ?? 0) <= (POS_MIN[pos] ?? 0)
                  return (
                    <div key={pos}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 4px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em' }}>{pos}</span>
                        {atMin && <span style={{ fontSize: 10, color: '#666' }}>最低{POS_MIN[pos]}人のため売却不可</span>}
                      </div>
                      {posPlayers.map(p => {
                        const stats = playerMap.get(p.player_id) ?? {}
                        const sellPrice = Math.floor((p.bought_price ?? 0) * (1 - SELL_FEE))
                        const canSell = (posCounts[p.position] ?? 0) > (POS_MIN[p.position] ?? 0)
                        return (
                          <div key={p.player_id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                              <div style={{ width: 36, height: 36, backgroundColor: p.team_color ?? '#555', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: textColor(p.team_color) }}>{stats.no ?? ''}</span>
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <Link href={`/player/${p.player_id}`} style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.06em', textDecoration: 'none' }}>{p.name_ja ?? p.name_en}</Link>
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{stats.team_name_ja ?? p.team_abbr}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                              <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 36, textAlign: 'center' }}>{calcAge(stats.dob) ?? '-'}</span>
                              <span style={{ fontSize: 13, color: 'var(--text-secondary)', width: 80, textAlign: 'center', whiteSpace: 'nowrap' }}>{formatPrice(p.bought_price)}</span>
                              <span style={{ fontSize: 13, fontWeight: 700, width: 80, textAlign: 'center', whiteSpace: 'nowrap', color: p.price > p.bought_price ? '#4caf50' : p.price < p.bought_price ? '#ef5350' : 'var(--text-primary)' }}>{formatPrice(p.price)}</span>
                              {canSell ? (
                                <button
                                  onClick={() => setConfirmPlayer(p)}
                                  disabled={actionLoading}
                                  style={{
                                    width: 34, height: 34, borderRadius: '50%', fontSize: 14, fontWeight: 700,
                                    backgroundColor: '#3d1010', color: '#ef5350',
                                    cursor: 'pointer', border: '1px solid #ef5350', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}
                                >
                                  売
                                </button>
                              ) : (
                                <div style={{ width: 34, flexShrink: 0 }} />
                              )}
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
