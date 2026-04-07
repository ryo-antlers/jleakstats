'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

function textColor(hex) {
  if (!hex || hex.length < 7) return '#fff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? '#fff' : '#000'
}

const NG_WORDS = [
  // 英語・性的
  'fuck', 'fucker', 'fucking', 'fucked', 'motherfucker', 'shit', 'bullshit',
  'bitch', 'asshole', 'ass', 'arse', 'dick', 'cock', 'penis', 'pussy',
  'cunt', 'tits', 'boobs', 'boob', 'titty', 'nipple', 'vagina', 'vulva',
  'anus', 'anal', 'butt', 'butthole', 'scrotum', 'testicle', 'balls',
  'cum', 'jizz', 'sperm', 'ejaculate', 'orgasm', 'masturbate', 'masturbation',
  'blowjob', 'handjob', 'rimjob', 'creampie', 'gangbang', 'threesome',
  'sex', 'porn', 'porno', 'nude', 'naked', 'hentai', 'erotic',
  'horny', 'kinky', 'fetish', 'bdsm', 'dildo', 'vibrator',
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'bastard', 'whore', 'slut',
  'rape', 'molest', 'pedophile', 'pedo', 'nazi', 'hitler', 'kkk',
  'kill', 'murder', 'suicide', 'terrorist', 'bomb',
  // 日本語・性的・身体
  'うんこ', 'うんち', 'うんぴ', 'うんにょ', 'うんち', 'くそ', 'クソ',
  'ちんこ', 'ちんぽ', 'ちんちん', 'まんこ', 'まんちょ', 'おまんこ',
  'きんたま', 'おっぱい', 'おちんちん', 'おちんぽ', 'ちくび', 'おしり',
  'けつ', 'ケツ', 'ふぐり', 'こうもん', 'アナル', 'おなに', 'オナニー',
  'せっくす', 'セックス', 'エロ', 'えろ', 'ポルノ', 'レイプ', 'わいせつ',
  'ヌード', 'はだか', '裸', 'ちんぽこ', 'まんすじ', 'パイズリ',
  'フェラ', 'クンニ', '中出し', '手マン', 'おまんちょ', 'おっぱっぴ',
  'ちんかす', 'まんかす', 'しおふき', '潮吹き', 'えろい', 'スケベ', 'すけべ',
  'ちんぽっぽ', 'おちんぽ', 'まん汁', 'ちん汁',
  // 日本語・侮辱
  'バカ', '馬鹿', 'アホ', 'アホ', 'ボケ', 'カス', 'クズ', 'ゴミ', 'ブス',
  'デブ', 'キモい', 'きもい', 'うざい', 'ウザい', 'きちく', '鬼畜',
  'チョン', 'チャンコロ', 'ジャップ', 'ガイジ', 'きちがい', '気違い',
  // 日本語・暴力・危険
  '死ね', '死んで', '殺す', '殺せ', '爆弾', 'テロ', '自殺', 'ころす',
  '消えろ', 'くたばれ',
  // 運営・なりすまし系
  'admin', 'administrator', 'official', 'staff', 'moderator', 'mod',
  '運営', '公式', 'システム', '管理者', '管理人',
]

function containsNG(text) {
  const lower = text.toLowerCase()
  return NG_WORDS.some(w => lower.includes(w.toLowerCase()))
}


export default function FantasySetupPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [teamName, setTeamName] = useState('')
  const [teamColor, setTeamColor] = useState('#00ff87')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (containsNG(username)) { setError('監督名に使用できない言葉が含まれています'); return }
    if (containsNG(teamName)) { setError('クラブ名に使用できない言葉が含まれています'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/fantasy/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, team_name: teamName, team_color: teamColor }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      router.push('/fantasy/new_squad')
    } catch (err) {
      setError(`エラー: ${err?.message ?? String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 15,
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    boxSizing: 'border-box',
    outline: 'none',
  }

  return (
    <div style={{
      minHeight: '80vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
        <p style={{ fontSize: 12, letterSpacing: '0.15em', color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase' }}>
          Fantasy J.League
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, whiteSpace: 'nowrap', overflow: 'visible' }}>
          Welcome to{teamName && <span style={{ color: teamColor, marginLeft: 10 }}>{teamName}</span>}
        </h1>

        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 32, lineHeight: 1.8 }}>
          ファンタジーサッカーを始めるために、<br />
          監督名とクラブ名を決めてください。
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 28, textAlign: 'left' }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>
              Manager Name
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder=""
              maxLength={20}
              required
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>
              Club Name
            </label>
            <input
              type="text"
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
              placeholder=""
              maxLength={20}
              required
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-secondary)', display: 'block', marginBottom: 10, textTransform: 'uppercase', textAlign: 'center' }}>
              Club Color
            </label>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <input
                type="color"
                value={teamColor}
                onChange={e => setTeamColor(e.target.value)}
                style={{ width: 50, height: 50, border: 'none', outline: 'none', cursor: 'pointer', backgroundColor: 'transparent', padding: 0, appearance: 'none', WebkitAppearance: 'none' }}
              />
            </div>
          </div>

          {error && (
            <p style={{ fontSize: 12, color: '#e55', textAlign: 'center' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 8,
              padding: '14px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.05em',
              backgroundColor: loading ? 'var(--bg-tertiary)' : teamColor,
              color: textColor(teamColor),
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
              border: 'none',
              width: '50%',
              display: 'block',
              margin: '0 auto',
            }}
          >
            {loading ? '設定中…' : '選手を獲得する'}
          </button>

        </form>
      </div>
    </div>
  )
}
