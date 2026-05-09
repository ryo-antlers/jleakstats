'use client'
import { Suspense, useState, useEffect } from 'react'
import { useSignIn, useAuth } from '@clerk/nextjs'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function SignInPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <SignInInner />
    </Suspense>
  )
}

function SignInInner() {
  const { signIn, fetchStatus } = useSignIn()
  const { isLoaded: authLoaded, isSignedIn } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectUrl = searchParams.get('redirect_url') || '/'

  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [errorCode, setErrorCode] = useState('')

  useEffect(() => {
    if (authLoaded && isSignedIn) router.replace(redirectUrl)
  }, [authLoaded, isSignedIn, redirectUrl, router])

  if (!signIn) {
    return <LoadingScreen />
  }

  async function sendCode(e) {
    e.preventDefault()
    if (pending) return
    setError('')
    setErrorCode('')
    setPending(true)
    try {
      const created = await signIn.create({ identifier: email })
      if (created.error) throw created.error
      const sent = await signIn.emailCode.sendCode()
      if (sent.error) throw sent.error
      setStep('code')
    } catch (err) {
      const code = err?.errors?.[0]?.code ?? err?.code ?? ''
      const raw = err?.errors?.[0]?.message ?? err?.message ?? ''
      setErrorCode(code)
      setError(translateError(code, raw))
    } finally {
      setPending(false)
    }
  }

  async function verifyCode(e) {
    e.preventDefault()
    if (pending) return
    setError('')
    setErrorCode('')
    setPending(true)
    try {
      const verified = await signIn.emailCode.verifyCode({ code })
      if (verified.error) throw verified.error
      const finalized = await signIn.finalize({
        navigate: ({ url }) => router.replace(url ?? redirectUrl),
      })
      if (finalized.error) throw finalized.error
      router.replace(redirectUrl)
    } catch (err) {
      const code = err?.errors?.[0]?.code ?? err?.code ?? ''
      const raw = err?.errors?.[0]?.message ?? err?.message ?? ''
      setErrorCode(code)
      setError(translateError(code, raw, 'verify'))
    } finally {
      setPending(false)
    }
  }

  const isFetching = fetchStatus === 'fetching'

  return (
    <div style={wrapperStyle}>
      <div style={cardStyle}>
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <h1 style={{
            margin: 0,
            color: '#fff',
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '0.12em',
          }}>
            J.LEAK STATS
          </h1>
          <div style={{
            marginTop: 8,
            color: '#666',
            fontSize: 11,
            letterSpacing: '0.18em',
          }}>
            {step === 'email' ? 'メールアドレスでサインイン' : '確認コードを入力'}
          </div>
        </div>

        {step === 'email' ? (
          <form onSubmit={sendCode}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              autoComplete="email"
              disabled={pending || isFetching}
              style={inputStyle}
            />
            {error && (
              <div style={errorStyle}>
                {error}
                {(errorCode === 'form_identifier_not_found' || errorCode === 'form_param_not_found_for_identifier') && (
                  <div style={{ marginTop: 6 }}>
                    <Link
                      href={`/sign-up?redirect_url=${encodeURIComponent(redirectUrl)}`}
                      style={{ color: '#00ff87', fontWeight: 700, textDecoration: 'none' }}
                    >
                      → 新規登録する
                    </Link>
                  </div>
                )}
              </div>
            )}
            <button
              type="submit"
              disabled={pending || isFetching || !email}
              style={primaryBtnStyle(pending || isFetching || !email)}
            >
              {pending || isFetching ? '送信中…' : '続ける ▸'}
            </button>
            <div id="clerk-captcha" />
          </form>
        ) : (
          <form onSubmit={verifyCode}>
            <div style={{
              marginBottom: 16, fontSize: 11, color: '#888',
              letterSpacing: '0.04em',
            }}>
              <span style={{ color: '#fff', fontWeight: 700 }}>{email}</span> に届いた6桁のコードを入力
            </div>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              disabled={pending || isFetching}
              style={{
                ...inputStyle,
                fontSize: 22,
                letterSpacing: '0.6em',
                textAlign: 'center',
                fontVariantNumeric: 'tabular-nums',
              }}
            />
            {error && <div style={errorStyle}>{error}</div>}
            <button
              type="submit"
              disabled={pending || isFetching || code.length !== 6}
              style={primaryBtnStyle(pending || isFetching || code.length !== 6)}
            >
              {pending || isFetching ? '確認中…' : 'サインイン ▸'}
            </button>
            <button
              type="button"
              onClick={async () => {
                try { await signIn.reset() } catch {}
                setStep('email')
                setCode('')
                setError('')
              }}
              disabled={pending || isFetching}
              style={ghostBtnStyle}
            >
              ← メールアドレスを変更
            </button>
          </form>
        )}

        <div style={{
          marginTop: 24, paddingTop: 20,
          borderTop: '1px solid #2a2a2a',
          textAlign: 'center', fontSize: 12, color: '#888',
        }}>
          はじめての方はこちら{' '}
          <Link
            href={`/sign-up${redirectUrl !== '/' ? `?redirect_url=${encodeURIComponent(redirectUrl)}` : ''}`}
            style={{ color: '#00ff87', fontWeight: 700, textDecoration: 'none' }}
          >
            アカウントを作成
          </Link>
        </div>
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div style={wrapperStyle}>
      <div style={{ color: '#888', fontSize: 12, letterSpacing: '0.2em' }}>LOADING...</div>
    </div>
  )
}

const wrapperStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  minHeight: '70vh',
  padding: '32px 16px',
}

const cardStyle = {
  width: '100%', maxWidth: 380,
  padding: '32px 28px',
}

const labelStyle = {
  display: 'block',
  marginBottom: 6,
  fontSize: 10,
  letterSpacing: '0.18em',
  color: '#888',
  fontWeight: 700,
}

const inputStyle = {
  width: '100%',
  padding: '12px 0',
  marginBottom: 18,
  backgroundColor: 'transparent',
  border: 'none',
  borderBottom: '1px solid #2a2a2a',
  color: '#fff',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s ease',
}

const primaryBtnStyle = (disabled) => ({
  width: '100%',
  padding: '12px',
  backgroundColor: disabled ? 'rgba(0,255,135,0.2)' : '#00ff87',
  color: disabled ? 'rgba(0,0,0,0.4)' : '#000',
  border: 'none',
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: '0.1em',
  cursor: disabled ? 'not-allowed' : 'pointer',
  transition: 'background-color 0.15s ease',
  fontFamily: 'inherit',
})

const ghostBtnStyle = {
  width: '100%',
  marginTop: 10,
  padding: '8px',
  backgroundColor: 'transparent',
  border: 'none',
  color: '#888',
  fontSize: 11,
  letterSpacing: '0.06em',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const errorStyle = {
  marginBottom: 14,
  padding: '8px 12px',
  fontSize: 11,
  color: '#ef5350',
  backgroundColor: 'rgba(239,83,80,0.08)',
  borderLeft: '2px solid #ef5350',
}

function translateError(code, raw, scope) {
  switch (code) {
    case 'form_identifier_not_found':
    case 'form_param_not_found_for_identifier':
      return 'このメールアドレスは登録されていません'
    case 'form_param_format_invalid':
    case 'form_param_format_invalid__email_address':
      return 'メールアドレスの形式が正しくありません'
    case 'form_code_incorrect':
    case 'verification_failed':
      return '確認コードが正しくありません'
    case 'verification_expired':
      return '確認コードの有効期限が切れています。再送信してください'
    case 'session_exists':
      return '既にサインインしています'
    case 'too_many_requests':
      return 'リクエストが多すぎます。しばらく待ってから再試行してください'
    default:
      if (scope === 'verify') return raw || 'コードが正しくありません'
      return raw || 'エラーが発生しました'
  }
}
