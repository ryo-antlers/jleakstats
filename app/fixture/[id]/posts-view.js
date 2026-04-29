'use client'
import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { submitPost, deletePost, reportPost } from './post-actions'

// ─────────────────────────────────────────────
// 掲示板ビュー（Slack 風: トップレベル + インラインで返信展開）
// ─────────────────────────────────────────────
export default function PostsView({ fixtureId, posts, userId, hasProfile }) {
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
    <section style={sectionStyle}>
      <h2 style={headerTitleStyle}>掲示板</h2>

      {/* トップレベル投稿フォーム */}
      <PostForm
        fixtureId={fixtureId}
        userId={userId}
        hasProfile={hasProfile}
        placeholder="試合の感想を投稿する..."
      />

      {/* 投稿一覧 */}
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {topLevel.length === 0 ? (
          <div style={emptyStyle}>まだ投稿がありません。最初の投稿をどうぞ。</div>
        ) : (
          topLevel.map(p => (
            <Thread
              key={p.id}
              post={p}
              replies={repliesMap.get(p.id) ?? []}
              fixtureId={fixtureId}
              userId={userId}
              hasProfile={hasProfile}
            />
          ))
        )}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────
// スレッド1件 (トップ投稿 + 返信)
// ─────────────────────────────────────────────
function Thread({ post, replies, fixtureId, userId, hasProfile }) {
  const [expanded, setExpanded] = useState(false)
  const hasReplies = replies.length > 0

  return (
    <div style={{ border: '1px solid #2a2a2a', backgroundColor: '#0d0d0d' }}>
      <PostCard post={post} fixtureId={fixtureId} userId={userId} />

      <div style={threadFooterStyle}>
        <button
          type="button"
          onClick={() => setExpanded(x => !x)}
          style={replyToggleStyle}
        >
          {hasReplies
            ? `💬 返信 ${replies.length} 件 ${expanded ? '▲' : '▼'}`
            : expanded
            ? '返信を閉じる ▲'
            : '返信する ▼'}
        </button>
      </div>

      {expanded && (
        <div style={repliesWrapStyle}>
          {replies.map(r => (
            <PostCard
              key={r.id}
              post={r}
              fixtureId={fixtureId}
              userId={userId}
              isReply
            />
          ))}
          <div style={{ padding: '8px 12px 12px' }}>
            <PostForm
              fixtureId={fixtureId}
              parentPostId={post.id}
              userId={userId}
              hasProfile={hasProfile}
              placeholder="返信を書く..."
              compact
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 投稿 1件
// ─────────────────────────────────────────────
function PostCard({ post, fixtureId, userId, isReply }) {
  const isMine = userId && post.clerk_user_id === userId
  const [menuOpen, setMenuOpen] = useState(false)
  const [reportMode, setReportMode] = useState(false)

  const [delState, delAction, delPending] = useActionState(deletePost, null)
  const [repState, repAction, repPending] = useActionState(reportPost, null)

  return (
    <div style={isReply ? replyCardStyle : cardStyle}>
      <div style={cardHeaderStyle}>
        <span style={{ fontSize: 13 }}>
          <span style={{ fontWeight: 700, color: '#fff' }}>
            {post.display_name ?? '(unknown)'}
          </span>
          {post.club_name_ja && (
            <span style={{
              marginLeft: 6, fontSize: 10, color: post.club_color ?? '#888',
            }}>
              {post.club_name_ja}
            </span>
          )}
        </span>
        <span style={{ fontSize: 10, color: '#555' }}>
          {formatRelative(post.created_at)}
        </span>

        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <button
            type="button"
            onClick={() => setMenuOpen(v => !v)}
            style={menuToggleStyle}
            aria-label="メニュー"
          >
            ⋯
          </button>
          {menuOpen && (
            <div style={menuStyle}>
              {isMine ? (
                <form action={delAction}>
                  <input type="hidden" name="post_id" value={post.id} />
                  <button
                    type="submit"
                    disabled={delPending}
                    style={menuItemStyle}
                    onClick={() => setMenuOpen(false)}
                  >
                    {delPending ? '削除中…' : '削除'}
                  </button>
                </form>
              ) : userId ? (
                <button
                  type="button"
                  onClick={() => { setReportMode(true); setMenuOpen(false) }}
                  style={menuItemStyle}
                >
                  通報
                </button>
              ) : (
                <div style={{ ...menuItemStyle, color: '#555', cursor: 'default' }}>
                  <Link href={`/sign-in?redirect_url=/fixture/${fixtureId}`} style={{ color: '#00ff87' }}>
                    サインイン
                  </Link>
                  して通報
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={cardBodyStyle}>
        {renderBody(post.body)}
      </div>

      {delState?.error && <div style={errorStyle}>{delState.error}</div>}

      {reportMode && (
        <form action={repAction} style={reportFormStyle}>
          <input type="hidden" name="post_id" value={post.id} />
          <input
            type="text"
            name="reason"
            placeholder="通報理由（任意、500文字以内）"
            maxLength={500}
            style={reportInputStyle}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="submit" disabled={repPending} style={reportBtnStyle}>
              {repPending ? '送信中…' : '通報する'}
            </button>
            <button
              type="button"
              onClick={() => setReportMode(false)}
              style={cancelBtnStyle}
            >
              キャンセル
            </button>
          </div>
          {repState?.error && <div style={errorStyle}>{repState.error}</div>}
          {repState?.success && <div style={successStyle}>通報を受け付けました</div>}
        </form>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 投稿フォーム (トップ or 返信)
// ─────────────────────────────────────────────
function PostForm({ fixtureId, parentPostId, userId, hasProfile, placeholder, compact }) {
  const [state, formAction, isPending] = useActionState(submitPost, null)
  const [body, setBody] = useState('')
  const prevSuccessRef = useRef(false)

  // 成功したら textarea をクリア
  useEffect(() => {
    if (state?.success && !prevSuccessRef.current) {
      setBody('')
      prevSuccessRef.current = true
    } else if (!state?.success) {
      prevSuccessRef.current = false
    }
  }, [state])

  if (!userId) {
    return (
      <div style={formLoginStyle}>
        <Link href={`/sign-in?redirect_url=/fixture/${fixtureId}`} style={{ color: '#00ff87' }}>
          サインイン
        </Link>
        {' '}して投稿・返信に参加しましょう
      </div>
    )
  }
  if (!hasProfile) {
    return (
      <div style={formLoginStyle}>
        投稿にはプロフィール設定が必要です{' '}
        <Link href={`/profile-setup?next=/fixture/${fixtureId}`} style={{ color: '#00ff87' }}>
          設定する
        </Link>
      </div>
    )
  }

  return (
    <form
      action={formAction}
      style={compact ? compactFormStyle : formStyle}
    >
      <input type="hidden" name="fixture_id" value={fixtureId} />
      {parentPostId != null && (
        <input type="hidden" name="parent_post_id" value={parentPostId} />
      )}
      <textarea
        name="body"
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder={placeholder ?? '投稿する...'}
        maxLength={1000}
        rows={compact ? 2 : 3}
        required
        style={textareaStyle}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: 10, color: '#555' }}>
          {body.length} / 1000
        </span>
        <button
          type="submit"
          disabled={isPending || body.trim().length === 0}
          style={postButtonStyle}
        >
          {isPending ? '投稿中…' : parentPostId ? '返信' : '投稿'}
        </button>
      </div>
      {state?.error && <div style={errorStyle}>{state.error}</div>}
    </form>
  )
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function renderBody(body) {
  // 改行を <br /> に変換。URLリンク化は MVP では無し
  return String(body)
    .split('\n')
    .map((line, i, arr) => (
      <span key={i}>
        {line}
        {i < arr.length - 1 && <br />}
      </span>
    ))
}

function formatRelative(iso) {
  const t = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.floor((now - t) / 1000)
  if (diff < 60) return `${diff}秒前`
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}日前`
  return new Date(iso).toLocaleDateString('ja-JP', {
    month: 'numeric', day: 'numeric',
  })
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const sectionStyle = {
  marginTop: 32,
  padding: 20,
  backgroundColor: '#111111',
  border: '1px solid #2a2a2a',
}

const headerTitleStyle = {
  color: '#fff', fontSize: 14, fontWeight: 700,
  letterSpacing: '0.1em', margin: '0 0 12px 0', textTransform: 'uppercase',
}

const emptyStyle = {
  fontSize: 11, color: '#555', textAlign: 'center',
  padding: '24px 0',
}

const cardStyle = {
  padding: 12,
}

const replyCardStyle = {
  padding: '10px 12px',
  borderTop: '1px solid #1a1a1a',
  backgroundColor: '#0a0a0a',
}

const cardHeaderStyle = {
  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
}

const cardBodyStyle = {
  fontSize: 13, color: '#ccc', lineHeight: 1.6, whiteSpace: 'pre-wrap',
}

const threadFooterStyle = {
  padding: '6px 12px', borderTop: '1px solid #1a1a1a',
  backgroundColor: '#0a0a0a',
}

const repliesWrapStyle = {
  backgroundColor: '#070707',
  borderTop: '1px solid #1a1a1a',
}

const replyToggleStyle = {
  background: 'none', border: 'none',
  color: '#888', fontSize: 11, letterSpacing: '0.04em',
  cursor: 'pointer', padding: '2px 6px',
}

const menuToggleStyle = {
  background: 'none', border: 'none',
  color: '#666', fontSize: 14, fontWeight: 700,
  cursor: 'pointer', padding: '2px 6px',
}

const menuStyle = {
  position: 'absolute', top: '100%', right: 0,
  minWidth: 120, backgroundColor: '#1a1a1a',
  border: '1px solid #2a2a2a', zIndex: 10,
}

const menuItemStyle = {
  display: 'block', width: '100%', textAlign: 'left',
  padding: '8px 12px', fontSize: 12,
  background: 'transparent', border: 'none', color: '#ddd',
  cursor: 'pointer',
}

const formStyle = {
  padding: 12,
  border: '1px solid #2a2a2a',
  backgroundColor: '#0d0d0d',
}

const compactFormStyle = {}

const textareaStyle = {
  width: '100%',
  padding: 10,
  backgroundColor: '#1a1a1a',
  border: '1px solid #2a2a2a',
  color: '#fff',
  fontSize: 13, fontFamily: 'inherit',
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box',
}

const postButtonStyle = {
  padding: '6px 14px',
  fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
  backgroundColor: '#00ff87', color: '#000',
  border: 'none', cursor: 'pointer',
}

const formLoginStyle = {
  padding: 12, fontSize: 12, color: '#888',
  backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a',
}

const reportFormStyle = {
  marginTop: 8, padding: 8,
  backgroundColor: '#1a0f0f', border: '1px solid #3a1a1a',
  display: 'flex', flexDirection: 'column', gap: 6,
}

const reportInputStyle = {
  padding: 6,
  backgroundColor: '#0a0a0a',
  border: '1px solid #2a2a2a',
  color: '#fff', fontSize: 11,
  outline: 'none',
}

const reportBtnStyle = {
  padding: '6px 10px', fontSize: 11, fontWeight: 700,
  backgroundColor: '#ef5350', color: '#fff',
  border: 'none', cursor: 'pointer',
}

const cancelBtnStyle = {
  padding: '6px 10px', fontSize: 11,
  backgroundColor: 'transparent', color: '#888',
  border: '1px solid #2a2a2a', cursor: 'pointer',
}

const errorStyle = {
  marginTop: 6, fontSize: 11, color: '#ef5350',
  padding: '6px 8px',
  backgroundColor: '#1a0f0f', border: '1px solid #3a1a1a',
}

const successStyle = {
  marginTop: 6, fontSize: 11, color: '#00ff87',
  padding: '6px 8px',
  backgroundColor: '#0a1a10', border: '1px solid #1a3a2a',
}
