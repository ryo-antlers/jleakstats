'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import FantasyLoading from '../FantasyLoading'

async function fetchIsMarketOpen() {
  try {
    const res = await fetch('/api/fantasy/gameweeks/schedule')
    const { gameweeks } = await res.json()
    const now = new Date()
    for (const gw of gameweeks) {
      if (!gw.deadline) continue
      const deadline = new Date(gw.deadline)
      const marketOpen = gw.market_open ? new Date(gw.market_open) : null
      if (now < deadline) return true
      if (marketOpen && now >= marketOpen) return true
    }
    return gameweeks.length === 0 // データなしなら開いているとみなす
  } catch { return true }
}

const FORMATIONS = [
  { label: '3-4-3', df: 3, mf: 4, fw: 3 },
  { label: '3-5-2', df: 3, mf: 5, fw: 2 },
  { label: '4-5-1', df: 4, mf: 5, fw: 1 },
  { label: '4-4-2', df: 4, mf: 4, fw: 2 },
  { label: '4-3-3', df: 4, mf: 3, fw: 3 },
  { label: '5-3-2', df: 5, mf: 3, fw: 2 },
]

function textColor(hex) {
  if (!hex) return '#fff'
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return (0.299*r + 0.587*g + 0.114*b)/255 < 0.5 ? '#fff' : '#000'
}

function initSlots(f) {
  return { GK: [null], DF: Array(f.df).fill(null), MF: Array(f.mf).fill(null), FW: Array(f.fw).fill(null) }
}

function autoFillSlots(f, byPos) {
  const top = (arr, n) => [...arr].sort((a,b)=>(b.bought_price??0)-(a.bought_price??0)).slice(0,n).map(p=>p.player_id)
  return {
    GK: [...top(byPos.GK,1), ...Array(1).fill(null)].slice(0,1),
    DF: [...top(byPos.DF,f.df), ...Array(f.df).fill(null)].slice(0,f.df),
    MF: [...top(byPos.MF,f.mf), ...Array(f.mf).fill(null)].slice(0,f.mf),
    FW: [...top(byPos.FW,f.fw), ...Array(f.fw).fill(null)].slice(0,f.fw),
  }
}

export default function StartersPage() {
  const router = useRouter()
  const [squad, setSquad] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formation, setFormation] = useState(null)
  const [slots, setSlots] = useState({ GK:[null], DF:[null,null,null,null], MF:[null,null,null,null], FW:[null,null] })
  const [dragging, setDragging] = useState(null) // { player_id, position }
  const [dragOverSlot, setDragOverSlot] = useState(null) // { pos, idx }

  useEffect(() => {
    fetchIsMarketOpen().then(open => { if (!open) router.replace('/fantasy') })
  }, [])

  useEffect(() => {
    fetch('/api/fantasy/squad').then(r=>r.json()).then(({ squad: sq }) => {
      const list = sq ?? []
      setSquad(list)
      const byPos = { GK:[], DF:[], MF:[], FW:[] }
      for (const p of list) if (byPos[p.position]) byPos[p.position].push(p)

      const starters = list.filter(p=>p.is_starter)
      const dfCnt = starters.filter(p=>p.position==='DF').length
      const mfCnt = starters.filter(p=>p.position==='MF').length
      const fwCnt = starters.filter(p=>p.position==='FW').length
      let f = FORMATIONS.find(f=>f.df===dfCnt&&f.mf===mfCnt&&f.fw===fwCnt)
      if (!f) f = FORMATIONS.find(f=>byPos.GK.length>=1&&byPos.DF.length>=f.df&&byPos.MF.length>=f.mf&&byPos.FW.length>=f.fw)
      if (f) {
        setFormation(f)
        const matchesCurrent = starters.length===11&&dfCnt===f.df&&mfCnt===f.mf&&fwCnt===f.fw
        if (matchesCurrent) {
          const s = { GK:[], DF:[], MF:[], FW:[] }
          for (const p of starters) s[p.position]?.push(p.player_id)
          setSlots({ GK:[s.GK[0]??null], DF:[...s.DF,...Array(f.df).fill(null)].slice(0,f.df), MF:[...s.MF,...Array(f.mf).fill(null)].slice(0,f.mf), FW:[...s.FW,...Array(f.fw).fill(null)].slice(0,f.fw) })
        } else {
          setSlots(autoFillSlots(f, byPos))
        }
      }
      setLoading(false)
    })
  }, [])

  const byPos = { GK:[], DF:[], MF:[], FW:[] }
  for (const p of squad) if (byPos[p.position]) byPos[p.position].push(p)
  for (const pos of ['GK','DF','MF','FW']) byPos[pos].sort((a,b)=>(b.bought_price??0)-(a.bought_price??0))

  const playerMap = new Map(squad.map(p=>[p.player_id,p]))
  const assignedIds = new Set(Object.values(slots).flat().filter(Boolean))

  function changeFormation(f) {
    setFormation(f)
    setSlots(autoFillSlots(f, byPos))
  }

  function clickPlayer(p) {
    const pos = p.position
    if (assignedIds.has(p.player_id)) return // スタメンはクリックで外さない
    const emptyIdx = slots[pos].indexOf(null)
    if (emptyIdx === -1) return
    setSlots(prev => { const next=[...prev[pos]]; next[emptyIdx]=p.player_id; return { ...prev, [pos]:next } })
  }

  function dropOnSlot(pos, idx) {
    if (!dragging || dragging.position !== pos) return
    setSlots(prev => {
      const next = { ...prev }
      const displaced = prev[pos][idx] // ターゲットにいた選手
      // dragging選手の元のスロット位置を探す
      const fromIdx = prev[pos].indexOf(dragging.player_id)
      // dragging選手を全スロットから除去
      for (const p of ['GK','DF','MF','FW']) next[p] = prev[p].map(id => id===dragging.player_id ? null : id)
      next[pos] = [...next[pos]]
      next[pos][idx] = dragging.player_id
      // ターゲットに別の選手がいた場合、元のスロットにスワップ
      if (displaced && displaced !== dragging.player_id && fromIdx !== -1) {
        next[pos][fromIdx] = displaced
      }
      return next
    })
    setDragging(null)
    setDragOverSlot(null)
  }

  function removeFromSlot(pos, idx) {
    setSlots(prev => { const next=[...prev[pos]]; next[idx]=null; return { ...prev, [pos]:next } })
  }

  const isComplete = formation &&
    slots.GK.every(Boolean) && slots.DF.every(Boolean) &&
    slots.MF.every(Boolean) && slots.FW.every(Boolean)

  async function save() {
    if (!isComplete) return
    setSaving(true)
    const starterIds = [...slots.GK,...slots.DF,...slots.MF,...slots.FW].filter(Boolean)
    await fetch('/api/fantasy/starters', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ starter_ids: starterIds }),
    })
    setSaving(false)
    localStorage.removeItem('fantasy_offsets')
    window.location.href = '/fantasy'
  }

  if (loading) return <FantasyLoading />

  const HEADER_H = 100

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ヘッダー */}
      <div style={{ flexShrink: 0, backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid #1e1e1e', padding: '14px 0 10px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <button onClick={()=>router.push('/fantasy')} style={{ background:'none', border:'none', color:'#666', cursor:'pointer', fontSize:20, padding:0, lineHeight:1 }}>←</button>
            <span style={{ fontSize:14, fontWeight:700, letterSpacing:'0.08em', color:'#fff' }}>スタメン編集</span>
          </div>
          <button onClick={save} disabled={!isComplete||saving} style={{
            padding:'7px 22px', fontSize:13, fontWeight:700,
            backgroundColor: isComplete ? 'var(--accent)' : '#222',
            color: isComplete ? '#000' : '#444',
            border:'none', cursor: isComplete ? 'pointer' : 'not-allowed',
          }}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
        {/* フォーメーション */}
        <div style={{ display:'flex', gap:4 }}>
          {FORMATIONS.map(f => {
            const ok = byPos.GK.length>=1&&byPos.DF.length>=f.df&&byPos.MF.length>=f.mf&&byPos.FW.length>=f.fw
            const active = formation?.label === f.label
            return (
              <button key={f.label} onClick={()=>ok&&changeFormation(f)} disabled={!ok} style={{
                flex:1, padding:'12px 0', fontSize:14, fontWeight: active?700:500,
                backgroundColor: active ? 'var(--accent)' : '#161616',
                color: active ? '#000' : ok ? '#bbb' : '#333',
                border: `1px solid ${active ? 'var(--accent)' : '#252525'}`,
                cursor: ok ? 'pointer' : 'not-allowed',
              }}>{f.label}</button>
            )
          })}
        </div>
      </div>

      {/* 2カラム */}
      <div style={{ flex:1, display:'grid', gridTemplateColumns:'180px 1fr', overflow:'hidden' }}>

        {/* 左: 選手一覧 */}
        <div style={{ overflowY:'auto', borderRight:'1px solid #1a1a1a', backgroundColor:'#0f0f0f' }}>
          {['FW','MF','DF','GK'].map(pos => {
            const limit = formation ? { GK:1, DF:formation.df, MF:formation.mf, FW:formation.fw }[pos] : 99
            const filled = slots[pos].filter(Boolean).length
            return (
              <div key={pos}>
                <div style={{ padding:'8px 10px 4px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.16em', color: '#fff' }}>{pos}</span>
                </div>
                {byPos[pos].map(p => {
                  const assigned = assignedIds.has(p.player_id)
                  return (
                    <div
                      key={p.player_id}
                      draggable
                      onDragStart={() => setDragging({ player_id: p.player_id, position: pos })}
                      onDragEnd={() => { setDragging(null); setDragOverSlot(null) }}
                      onClick={() => clickPlayer(p)}
                      style={{
                        display:'flex', alignItems:'center', gap:6, padding:'6px 10px',
                        cursor: assigned ? 'pointer' : slots[pos].includes(null) ? 'grab' : 'default',
                        opacity: assigned ? 0.3 : 1,
                        borderLeft: '2px solid transparent',
                        backgroundColor: 'transparent',
                        userSelect:'none',
                      }}
                    >
                      <div style={{ width:3, height:16, backgroundColor: p.team_color??'#555', flexShrink:0 }} />
                      <span style={{ fontSize:12, color: assigned ? '#888' : '#ccc', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flex:1, letterSpacing:'0.02em' }}>
                        {p.name_ja ?? p.name_en}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* 右: フォーメーション */}
        <div style={{ display:'flex', flexDirection:'column', padding:'12px 16px', gap:8, overflow:'hidden', justifyContent:'space-between' }}>
          {['FW','MF','DF','GK'].map(pos => {
            const posSlots = slots[pos]
            const canDrop = dragging?.position === pos
            return (
              <div key={pos} style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
                <div style={{ fontSize:12, fontWeight:700, letterSpacing:'0.16em', color:'#fff', textAlign:'center', marginBottom:4 }}>{pos}</div>
                <div style={{ flex:1, display:'flex', gap:6, justifyContent:'center', alignItems:'center' }}>
                  {posSlots.map((playerId, idx) => {
                    const p = playerId ? playerMap.get(playerId) : null
                    const isOver = dragOverSlot?.pos===pos && dragOverSlot?.idx===idx
                    return (
                      <div
                        key={idx}
                        onDragOver={e => { if (canDrop) { e.preventDefault(); setDragOverSlot({pos,idx}) } }}
                        onDragLeave={() => setDragOverSlot(null)}
                        onDrop={() => dropOnSlot(pos, idx)}
                        style={{
                          flex:1, maxWidth:120, height:'100%',
                          border: isOver ? '1px solid var(--accent)' : p ? 'none' : '1px dashed #2a2a2a',
                          backgroundColor: isOver ? 'rgba(0,255,135,0.08)' : p ? 'transparent' : '#141414',
                          display:'flex', flexDirection:'column', overflow:'hidden',
                          transition:'border-color 0.1s, background-color 0.1s',
                          position:'relative',
                        }}
                      >
                        {p ? (
                          <div
                            draggable
                            onDragStart={() => setDragging({ player_id: p.player_id, position: pos })}
                            onDragEnd={() => { setDragging(null); setDragOverSlot(null) }}
                            style={{ display:'flex', flexDirection:'column', flex:1, cursor:'grab' }}
                          >
                            <div style={{ height:3, backgroundColor: p.team_color??'#555', flexShrink:0 }} />
                            <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', padding:'4px 6px' }}>
                              <span style={{ fontSize:11, fontWeight:700, color:'#fff', textAlign:'center', lineHeight:1.3, letterSpacing:'0.02em', overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                                {p.name_ja ?? p.name_en}
                              </span>
                              <span style={{ fontSize:9, color:'#555', marginTop:2 }}>{p.team_abbr}</span>
                            </div>
                          </div>
                        ) : (
                          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
                            {canDrop
                              ? <span style={{ fontSize:9, color:'var(--accent)', letterSpacing:'0.08em' }}>DROP</span>
                              : <span style={{ fontSize:9, color:'#2a2a2a' }}>—</span>
                            }
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
