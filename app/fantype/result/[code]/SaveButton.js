'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUser, SignInButton } from '@clerk/nextjs'

/**
 * 「このタイプをプロフィールに保存」ボタン。
 *  - 未ログイン: SignIn 誘導
 *  - ログイン済 & 保存済 (同コード): 保存済表示
 *  - ログイン済 & 未保存 or 異コード: 保存ボタン
 */
export default function SaveButton({ code, answers }) {
  const router = useRouter()
  const { isSignedIn, isLoaded } = useUser()
  const [savedCode, setSavedCode] = useState(null)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    if (!isSignedIn) return
    fetch('/api/fantype/profile')
      .then((r) => r.json())
      .then((d) => setSavedCode(d.code ?? null))
      .catch(() => setSavedCode(null))
  }, [isSignedIn])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/fantype/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, answers }),
      })
      if (!res.ok) throw new Error('save failed')
      setSavedCode(code)
      setJustSaved(true)
      router.refresh() // トップなど SSR 表示を更新
      setTimeout(() => setJustSaved(false), 2400)
    } catch {
      alert('保存に失敗しました。もう一度試してください。')
    } finally {
      setSaving(false)
    }
  }

  if (!isLoaded) {
    return <div className="text-xs text-zinc-500">読み込み中…</div>
  }

  // 未ログイン: Clerk のサインインへ
  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full font-medium px-4 py-2 text-xs text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500 transition-colors"
        >
          サインインして保存
        </button>
      </SignInButton>
    )
  }

  const alreadySavedSame = savedCode === code

  return (
    <div className="flex items-center gap-3">
      {justSaved && (
        <span className="text-xs" style={{ color: 'var(--accent)' }}>
          ✓ 保存しました
        </span>
      )}
      <button
        type="button"
        onClick={save}
        disabled={saving || alreadySavedSame}
        className="inline-flex items-center justify-center rounded-full font-medium px-4 py-2 text-xs text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      >
        {alreadySavedSame
          ? '✓ 保存済み'
          : saving
            ? '保存中…'
            : savedCode
              ? `${code} に更新する`
              : 'プロフィールに保存'}
      </button>
    </div>
  )
}
