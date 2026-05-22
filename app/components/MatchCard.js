import Link from 'next/link'
import { Building2, Flag, Users } from 'lucide-react'

// 試合カード (採点ダッシュボード・プロフィールページで共通)
//   - 上: 日付 + コンペ (例: J1 第15節)
//   - 中: ホーム/アウェイ スコア (色付きハーフ、敗チームは透過)
//   - 下: 会場 / 観客数 / 主審 + 任意の action
//
// props:
//   fixture       : fixtures + teams_master の JOIN 結果
//   fixtureHref   : カード全体 (上 + 下メタ) のクリック先
//   ratingHref    : action 領域のクリック先 (任意)
//   action        : action 領域 (採点ボタンなど、任意)
//   isUserHome    : 推しクラブがホームか (敗チームの opacity を下げる用)

function normalizeColor(raw) {
  if (!raw) return '#444'
  const v = String(raw).trim()
  if (!v) return '#444'
  return v.startsWith('#') ? v : `#${v}`
}

function textOn(hex) {
  const h = (hex ?? '').replace('#', '')
  if (h.length < 6) return '#fff'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? '#fff' : '#000'
}

function leagueLabel(leagueId) {
  switch (Number(leagueId)) {
    case 1: return 'J1'
    case 2: return 'J2'
    case 98: return '百年構想'
    case 100: return 'カップ'
    default: return ''
  }
}

function formatJST(iso) {
  if (!iso) return ''
  const d = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

export default function MatchCard({ fixtureHref, ratingHref, fixture, isUserHome, action }) {
  const homeColor = normalizeColor(fixture.home_color)
  const awayColor = normalizeColor(fixture.away_color)
  const homeText = textOn(homeColor)
  const awayText = textOn(awayColor)
  const homeName = fixture.home_abbr || fixture.home_short || fixture.home_name || '-'
  const awayName = fixture.away_abbr || fixture.away_short || fixture.away_name || '-'
  const isPK = fixture.status === 'PEN' && fixture.home_penalty != null && fixture.away_penalty != null
  const comp = leagueLabel(fixture.league_id)
  const attendance = fixture.attendance != null ? Number(fixture.attendance).toLocaleString() : null
  const venue = fixture.venue_name_ja || null

  const halfStyle = (bg, txt, lose) => ({
    backgroundColor: bg, color: txt,
    opacity: lose ? 0.45 : 1,
    padding: '8px 8px 18px',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 2,
    minWidth: 0, minHeight: 78,
    position: 'relative',
  })
  const teamNameStyle = (txt) => ({
    fontWeight: 900, fontSize: 13, color: txt,
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    maxWidth: '100%',
  })
  const scoreStyle = (txt) => ({
    fontWeight: 900, fontSize: 26, color: txt,
    letterSpacing: '0.02em',
  })
  const pkStyle = (txt) => ({
    position: 'absolute', bottom: 3, left: 0, right: 0,
    textAlign: 'center', fontSize: 12, fontWeight: 800,
    color: txt, letterSpacing: '0.06em',
  })
  const linkReset = {
    display: 'block', textDecoration: 'none', color: 'inherit',
  }

  return (
    <div
      className="search-card"
      style={{
        display: 'flex', flexDirection: 'column',
        color: '#fff', fontVariantNumeric: 'tabular-nums',
        height: '100%', overflow: 'hidden',
        // 親 grid/flex の幅に従う (内部の長いスタジアム名等でカードが広がるのを防ぐ)
        width: '100%', minWidth: 0,
      }}
    >
      {/* 上 + 中央スコア箱 */}
      <Link href={fixtureHref} style={{ ...linkReset, display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          padding: '12px 12px 10px',
        }}>
          <span style={{
            fontSize: 11, color: '#fff',
            fontWeight: 800, letterSpacing: '0.02em',
          }}>
            {formatJST(fixture.date)}
          </span>
          {comp && (
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
              color: '#bbb', textTransform: 'uppercase',
            }}>
              {comp}{fixture.round_number ? ` 第${fixture.round_number}節` : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <div style={halfStyle(homeColor, homeText, !isUserHome)}>
            <span style={teamNameStyle(homeText)}>{homeName}</span>
            <span style={scoreStyle(homeText)}>{fixture.home_score}</span>
            {isPK && <span style={pkStyle(homeText)}>PK {fixture.home_penalty}</span>}
          </div>
          <div style={halfStyle(awayColor, awayText, isUserHome)}>
            <span style={teamNameStyle(awayText)}>{awayName}</span>
            <span style={scoreStyle(awayText)}>{fixture.away_score}</span>
            {isPK && <span style={pkStyle(awayText)}>PK {fixture.away_penalty}</span>}
          </div>
        </div>
      </Link>

      {/* 下: アクション + メタ情報 */}
      <div style={{ marginTop: 'auto' }}>
        {action && ratingHref && (
          <Link href={ratingHref} style={{ ...linkReset, paddingTop: 8 }}>
            {action}
          </Link>
        )}
        <Link href={fixtureHref} style={{
          ...linkReset,
          padding: '10px 12px 12px',
        }}>
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            fontSize: 10, fontWeight: 700, color: '#fff',
            minWidth: 0,
          }}>
            {venue && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 6,
                overflow: 'hidden', minWidth: 0,
              }}>
                <Building2 size={12} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                <span style={{
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{venue}</span>
              </span>
            )}
            {attendance && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 6,
                whiteSpace: 'nowrap',
              }}>
                <Users size={12} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                <span>{attendance}人</span>
              </span>
            )}
            {fixture.referee_ja_official && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 6,
                overflow: 'hidden', minWidth: 0,
              }}>
                <Flag size={12} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                <span style={{
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{fixture.referee_ja_official}</span>
              </span>
            )}
          </div>
        </Link>
      </div>
    </div>
  )
}
