'use client'
import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { submitPost, deletePost, reportPost } from './post-actions'

// 名前からアバター色を生成 (Slack風)
const AVATAR_COLORS = [
  '#7c3aed', '#ec4899', '#f97316', '#10b981',
  '#3b82f6', '#ef4444', '#f59e0b', '#06b6d4',
  '#a855f7', '#14b8a6', '#f43f5e', '#84cc16',
]
function nameToColor(name) {
  const s = name || '?'
  const hash = [...s].reduce((a, c) => a + c.charCodeAt(0), 0)
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}
function nameInitial(name) {
  const s = (name || '?').trim()
  return [...s][0] ?? '?'
}

// ─────────────────────────────────────────────
// 掲示板ビュー (Slack風)
// ─────────────────────────────────────────────
export default function PostsView({ fixtureId, posts, userId, hasProfile, profile, homeAbbr, awayAbbr }) {
  const { topLevel, repliesMap } = useMemo(() => {
    const top = []
    const rmap = new Map()
    for (const p of posts) {
      if (p.parent_post_id == null) {
        top.push(p)
      } else {
        const arr = rmap.get(p.parent_post_id) ?? []
        arr.push(p)
        rmap.set(p.parent_post_id, arr)
      }
    }
    return { topLevel: top, repliesMap: rmap }
  }, [posts])

  return (
    <section style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
        <h2 style={{
          color: '#fff', fontSize: 13, fontWeight: 800,
          letterSpacing: '0.18em', margin: 0, textTransform: 'uppercase',
        }}>
          DISCUSSION
        </h2>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
          {posts.length}件
        </span>
        <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
      </div>

      {/* 投稿一覧 (上から古い→新しい) — 0件時は何も表示しない */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {topLevel.map((p, i) => (
            <Thread
              key={p.id}
              post={p}
              rank={i + 1}
              replies={repliesMap.get(p.id) ?? []}
              fixtureId={fixtureId}
              userId={userId}
              hasProfile={hasProfile}
              profile={profile}
              homeAbbr={homeAbbr}
              awayAbbr={awayAbbr}
            />
        ))}
      </div>

      {/* 投稿フォーム (一番下) */}
      <div style={{ marginTop: 20 }}>
        <PostForm
          fixtureId={fixtureId}
          userId={userId}
          hasProfile={hasProfile}
          profile={profile}
          homeAbbr={homeAbbr}
          awayAbbr={awayAbbr}
        />
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────
// スレッド1件 (トップ + 返信群)
// ─────────────────────────────────────────────
function Thread({ post, rank, replies, fixtureId, userId, hasProfile, profile, homeAbbr, awayAbbr }) {
  const [expanded, setExpanded] = useState(false)
  const [replyMode, setReplyMode] = useState(false)
  const hasReplies = replies.length > 0

  return (
    <div style={{ position: 'relative' }}>
      <PostCard post={post} rank={rank} fixtureId={fixtureId} userId={userId} />

      {/* スレッドアクション (Slack風: 返信件数 + 返信ボタン) */}
      <div style={{
        marginLeft: 52,  // アバター幅+gap
        marginTop: -4, marginBottom: 8,
        display: 'flex', gap: 12, alignItems: 'center',
      }}>
        {hasReplies && (
          <button
            type="button"
            onClick={() => setExpanded(x => !x)}
            style={{
              background: 'none', border: 'none', padding: 0,
              color: '#00ff87', fontSize: 11, fontWeight: 700,
              cursor: 'pointer', letterSpacing: '0.04em',
            }}
          >
            {expanded ? '▾' : '▸'} 返信 {replies.length}件
          </button>
        )}
        {!replyMode && (
          <button
            type="button"
            onClick={() => setReplyMode(true)}
            style={{
              background: 'none', border: 'none', padding: 0,
              color: 'rgba(255,255,255,0.4)', fontSize: 11,
              cursor: 'pointer', letterSpacing: '0.04em',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
          >
            返信する
          </button>
        )}
      </div>

      {/* 返信展開 */}
      {(expanded && hasReplies) && (
        <div style={{
          marginLeft: 24,
          paddingLeft: 16,
          borderLeft: '2px solid rgba(0,255,135,0.25)',
          marginBottom: 8,
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {replies.map(r => (
            <PostCard
              key={r.id}
              post={r}
              fixtureId={fixtureId}
              userId={userId}
              isReply
            />
          ))}
        </div>
      )}

      {/* 返信フォーム */}
      {replyMode && (
        <div style={{
          marginLeft: 24,
          paddingLeft: 16,
          borderLeft: '2px solid rgba(0,255,135,0.25)',
          marginBottom: 12,
        }}>
          <PostForm
            fixtureId={fixtureId}
            parentPostId={post.id}
            userId={userId}
            hasProfile={hasProfile}
            profile={profile}
            homeAbbr={homeAbbr}
            awayAbbr={awayAbbr}
            compact
            onCancel={() => setReplyMode(false)}
            onSuccess={() => { setReplyMode(false); setExpanded(true) }}
          />
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 投稿1件 (アバター + 名前 + 時間 + 本文)
// ─────────────────────────────────────────────
function PostCard({ post, rank, fixtureId, userId, isReply }) {
  const isMine = userId && post.clerk_user_id === userId
  const [hover, setHover] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [reportMode, setReportMode] = useState(false)

  const [delState, delAction, delPending] = useActionState(deletePost, null)
  const [repState, repAction, repPending] = useActionState(reportPost, null)

  const name = post.display_name ?? '名無し'
  // クラブカラー優先、未設定 (ゲスト等) なら名前ハッシュからフォールバック
  const avatarColor = post.club_color || nameToColor(name)
  const initial = nameInitial(name)
  const avatarSize = isReply ? 28 : 36

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'flex',
        gap: isReply ? 12 : 12,
        padding: isReply ? '6px 8px' : '10px 8px',
        backgroundColor: hover ? 'rgba(255,255,255,0.02)' : 'transparent',
        transition: 'background-color 0.15s ease',
        borderRadius: 4,
      }}
    >
      {/* アバター (クラブカラー + 名前頭文字) */}
      <div style={{
        width: avatarSize, height: avatarSize, borderRadius: '50%',
        backgroundColor: avatarColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 800, fontSize: isReply ? 13 : 16,
        flexShrink: 0,
        boxShadow: hover ? `0 0 0 2px rgba(0,255,135,0.15)` : 'none',
        transition: 'box-shadow 0.15s ease',
      }}>
        {initial}
      </div>

      {/* 内容 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
          {rank != null && !isReply && (
            <span style={{
              color: 'rgba(255,255,255,0.45)',
              fontSize: 12, fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              flexShrink: 0,
            }}>
              {rank}
            </span>
          )}
          <span style={{
            fontSize: isReply ? 12 : 13, fontWeight: 700, color: '#fff',
            letterSpacing: '0.02em',
          }}>
            {name}
            {post.club_abbr && (
              <>
                <span style={{ color: 'rgba(255,255,255,0.4)', margin: '0 4px', fontWeight: 500 }}>/</span>
                <span title={post.club_name_ja}>{post.club_abbr}</span>
              </>
            )}
          </span>
          {post.is_guest && (
            <span style={{
              fontSize: 8, color: 'rgba(255,255,255,0.45)',
              letterSpacing: '0.1em', fontWeight: 700,
              padding: '1px 5px',
              border: '1px solid rgba(255,255,255,0.15)',
            }}>
              GUEST
            </span>
          )}
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
            {formatTimestamp(post.created_at)}
          </span>
        </div>
        <div style={{
          fontSize: isReply ? 12 : 13.5, color: 'rgba(255,255,255,0.85)',
          lineHeight: 1.6, whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {renderBody(post.body)}
        </div>

        {/* 通報フォーム */}
        {reportMode && (
          <form action={repAction} style={{
            marginTop: 8, padding: 10,
            backgroundColor: 'rgba(239,83,80,0.05)',
            borderLeft: '2px solid #ef5350',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <input type="hidden" name="post_id" value={post.id} />
            <input
              type="text"
              name="reason"
              placeholder="通報理由 (任意、500文字以内)"
              maxLength={500}
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={repPending} style={{
                ...filledBtnStyle,
                backgroundColor: '#ef5350', color: '#fff',
              }}>
                {repPending ? '送信中…' : '通報する'}
              </button>
              <button
                type="button"
                onClick={() => setReportMode(false)}
                style={ghostBtnStyle}
              >
                キャンセル
              </button>
            </div>
            {repState?.error && <div style={errorStyle}>{repState.error}</div>}
            {repState?.success && <div style={successStyle}>通報を受け付けました</div>}
          </form>
        )}
        {delState?.error && <div style={errorStyle}>{delState.error}</div>}
      </div>

      {/* ホバー時のアクションメニュー (右上) */}
      {(hover || menuOpen) && (
        <div style={{
          position: 'absolute', top: 6, right: 6,
        }}>
          <button
            type="button"
            onClick={() => setMenuOpen(v => !v)}
            style={{
              width: 24, height: 24, borderRadius: 4,
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', padding: 0, lineHeight: 1,
            }}
            aria-label="メニュー"
          >
            ⋯
          </button>
          {menuOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', right: 0,
              minWidth: 140,
              backgroundColor: '#1a1a1a',
              border: '1px solid rgba(255,255,255,0.15)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              zIndex: 10,
              overflow: 'hidden',
            }}>
              {isMine ? (
                <form action={delAction}>
                  <input type="hidden" name="post_id" value={post.id} />
                  <button
                    type="submit"
                    disabled={delPending}
                    style={menuItemStyle}
                    onClick={() => setMenuOpen(false)}
                  >
                    {delPending ? '削除中…' : '🗑 削除'}
                  </button>
                </form>
              ) : userId ? (
                <button
                  type="button"
                  onClick={() => { setReportMode(true); setMenuOpen(false) }}
                  style={menuItemStyle}
                >
                  ⚠ 通報
                </button>
              ) : (
                <Link
                  href={`/sign-in?redirect_url=/fixture/${fixtureId}`}
                  style={{ ...menuItemStyle, display: 'block', textDecoration: 'none' }}
                >
                  サインインして通報
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 投稿フォーム
// ─────────────────────────────────────────────
function PostForm({ fixtureId, parentPostId, userId, hasProfile, profile, homeAbbr, awayAbbr, compact, onCancel, onSuccess }) {
  const [state, formAction, isPending] = useActionState(submitPost, null)
  const [body, setBody] = useState('')
  const [guestName, setGuestName] = useState('')
  const [successFlash, setSuccessFlash] = useState(false)
  const prevSuccessRef = useRef(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (state?.success && !prevSuccessRef.current) {
      setBody('')
      prevSuccessRef.current = true
      setSuccessFlash(true)
      onSuccess?.()
      const t = setTimeout(() => setSuccessFlash(false), 1500)
      return () => clearTimeout(t)
    } else if (!state?.success) {
      prevSuccessRef.current = false
    }
  }, [state, onSuccess])

  // textarea を内容に応じて自動拡張 (1行から開始 → スクロールバー出さずに伸ばす)
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [body])

  if (userId && !hasProfile) {
    return (
      <div style={{
        padding: 16, fontSize: 12, color: 'rgba(255,255,255,0.7)',
        backgroundColor: 'rgba(0,255,135,0.05)',
        borderLeft: '2px solid #00ff87',
      }}>
        投稿にはプロフィール設定が必要です{' '}
        <Link href={`/profile-setup?next=/fixture/${fixtureId}`} style={{ color: '#00ff87', fontWeight: 700 }}>
          → 設定する
        </Link>
      </div>
    )
  }

  const isGuest = !userId
  const canSubmit = !isPending && body.trim().length > 0
    && (!isGuest || guestName.trim().length > 0)

  return (
    <form
      action={formAction}
      style={{
        padding: compact ? 10 : 14,
      }}
    >
      <input type="hidden" name="fixture_id" value={fixtureId} />
      {parentPostId != null && (
        <input type="hidden" name="parent_post_id" value={parentPostId} />
      )}
      {!isGuest && profile && (
        <PostFormIdentity profile={profile} compact={compact} />
      )}
      {isGuest && (
        <input
          type="text"
          name="guest_name"
          value={guestName}
          onChange={e => setGuestName(e.target.value)}
          placeholder="名前 (公開されます)"
          maxLength={30}
          required
          style={{
            ...inputStyle,
            marginBottom: 8,
            fontSize: 13,
            fontWeight: 700,
            color: '#fff',
          }}
        />
      )}
      <textarea
        ref={textareaRef}
        name="body"
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder={parentPostId ? '返信する' : (homeAbbr && awayAbbr ? `${homeAbbr}×${awayAbbr}について` : '')}
        maxLength={200}
        rows={1}
        required
        style={{
          width: '100%',
          padding: '4px 0',
          backgroundColor: 'transparent',
          border: 'none',
          color: '#fff',
          fontFamily: 'inherit',
          outline: 'none',
          resize: 'none',
          overflow: 'hidden',
          fontSize: 13.5,
          lineHeight: 1.6,
        }}
      />

      {/* 文字カウント (textareaの直下) */}
      <div style={{
        marginTop: 4, fontSize: 10, color: 'rgba(255,255,255,0.35)',
        textAlign: 'right',
      }}>
        {isGuest && <span style={{ marginRight: 8 }}>ログインなし</span>}
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{body.length} / 200</span>
      </div>

      {/* 送信ボタン行 (キャンセル + 投稿する) — 従来位置 */}
      <div style={{
        display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
        marginTop: 10, gap: 6,
      }}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={ghostBtnStyle}
          >
            キャンセル
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            ...filledBtnStyle,
            backgroundColor: successFlash ? '#22c55e' : (canSubmit ? '#00ff87' : 'rgba(0,255,135,0.2)'),
            color: successFlash ? '#fff' : (canSubmit ? '#000' : 'rgba(255,255,255,0.3)'),
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            transition: 'background-color 0.2s ease, color 0.2s ease',
          }}
        >
          {successFlash ? '✓ 投稿しました!' : isPending ? '送信中…' : parentPostId ? '返信する' : '投稿する'}
        </button>
      </div>
      {state?.error && <div style={errorStyle}>{state.error}</div>}
    </form>
  )
}

// ─────────────────────────────────────────────
// 投稿フォーム上部のアイデンティティ表示 (アバター + 名前 + クラブ)
// ─────────────────────────────────────────────
function PostFormIdentity({ profile, compact }) {
  const name = profile.display_name ?? '名無し'
  const avatarColor = profile.club_color || nameToColor(name)
  const initial = nameInitial(name)
  const size = compact ? 28 : 32
  const abbr = profile.club_abbr ?? null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      paddingBottom: compact ? 6 : 8,
      marginBottom: compact ? 6 : 8,
      borderBottom: '1px solid rgba(255,255,255,0.15)',
    }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        backgroundColor: avatarColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 800, fontSize: compact ? 13 : 14,
        flexShrink: 0,
      }}>
        {initial}
      </div>
      <span style={{
        fontSize: compact ? 12 : 13, fontWeight: 700, color: '#fff',
        letterSpacing: '0.02em',
      }}>
        {name}
        {abbr && (
          <>
            <span style={{ color: 'rgba(255,255,255,0.4)', margin: '0 4px', fontWeight: 500 }}>/</span>
            <span title={profile.club_name_ja}>{abbr}</span>
          </>
        )}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function renderBody(body) {
  return String(body)
    .split('\n')
    .map((line, i, arr) => (
      <span key={i}>
        {line}
        {i < arr.length - 1 && <br />}
      </span>
    ))
}

function formatTimestamp(iso) {
  if (!iso) return ''
  // JST に変換した上で「2026年5月3日 14:19」形式
  const d = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}年${m}月${day}日 ${h}:${min}`
}

// ─────────────────────────────────────────────
// 共通 styles
// ─────────────────────────────────────────────
const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  backgroundColor: 'transparent',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
}

const filledBtnStyle = {
  padding: '7px 16px',
  fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
  border: 'none',
  cursor: 'pointer',
  textTransform: 'uppercase',
  transition: 'opacity 0.15s ease',
}

const ghostBtnStyle = {
  padding: '7px 12px',
  fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.15)',
  color: 'rgba(255,255,255,0.65)',
  cursor: 'pointer',
}

const menuItemStyle = {
  display: 'block', width: '100%', textAlign: 'left',
  padding: '10px 14px', fontSize: 12,
  background: 'transparent', border: 'none',
  color: 'rgba(255,255,255,0.85)',
  cursor: 'pointer',
}

const errorStyle = {
  marginTop: 8, fontSize: 11, color: '#ef5350',
  padding: '6px 10px',
  borderLeft: '2px solid #ef5350',
  backgroundColor: 'rgba(239,83,80,0.05)',
}

const successStyle = {
  marginTop: 8, fontSize: 11, color: '#00ff87',
  padding: '6px 10px',
  borderLeft: '2px solid #00ff87',
  backgroundColor: 'rgba(0,255,135,0.05)',
}
