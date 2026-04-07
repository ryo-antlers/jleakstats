'use client'
import { useSignIn, useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

export default function SignInPage() {
  const { signIn, isLoaded, setActive } = useSignIn()
  const { isSignedIn } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (isSignedIn) router.replace('/fantasy')
  }, [isSignedIn])
  const [step, setStep] = useState('email') // 'email' | 'code'
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submitEmail(e) {
    e.preventDefault()
    if (!isLoaded) return
    setError('')
    setLoading(true)
    try {
      const si = await signIn.create({ identifier: email })
      const emailFactor = si.supportedFirstFactors?.find(f => f.strategy === 'email_code')
      await si.prepareFirstFactor({
        strategy: 'email_code',
        emailAddressId: emailFactor?.emailAddressId,
      })
      setStep('code')
    } catch (err) {
      setError(err.errors?.[0]?.message ?? 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  async function submitCode(e) {
    e.preventDefault()
    if (!isLoaded) return
    setError('')
    setLoading(true)
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'email_code',
        code,
      })
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        router.push('/fantasy')
      }
    } catch (err) {
      setError(err.errors?.[0]?.message ?? 'コードが正しくありません')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '12px 14px', fontSize: 14,
    backgroundColor: '#1a1a1a', color: '#fff',
    border: '1px solid #2a2a2a', outline: 'none',
    boxSizing: 'border-box',
    letterSpacing: '0.04em',
  }

  const btnStyle = (disabled) => ({
    width: '100%', padding: '13px 0', fontSize: 13, fontWeight: 700,
    backgroundColor: disabled ? '#1a1a1a' : 'var(--accent)',
    color: disabled ? '#444' : '#000',
    border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    letterSpacing: '0.1em', transition: 'background-color 0.15s',
  })

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '80vh',
    }}>
      <div style={{ width: 360, maxWidth: '100%' }}>

        {/* ロゴ */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: '0.12em', color: '#fff' }}>
            J.<span style={{ color: 'var(--accent)' }}>LEAK</span> STATS
          </span>
          <p style={{ fontSize: 11, color: '#555', marginTop: 6, letterSpacing: '0.1em' }}>
            {step === 'email' ? 'メールアドレスでサインイン' : '確認コードを入力'}
          </p>
        </div>

        {step === 'email' ? (
          <form onSubmit={submitEmail} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', display: 'block', marginBottom: 6 }}>
                EMAIL ADDRESS
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="example@email.com"
                required
                autoFocus
                style={inputStyle}
              />
            </div>
            {error && <p style={{ fontSize: 11, color: '#ef5350', margin: 0 }}>{error}</p>}
            <button type="submit" disabled={loading || !email} style={btnStyle(loading || !email)}>
              {loading ? '送信中…' : 'コードを送信'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', display: 'block', marginBottom: 6 }}>
                確認コード
              </label>
              <p style={{ fontSize: 11, color: '#555', marginBottom: 10, lineHeight: 1.6 }}>
                <span style={{ color: '#888' }}>{email}</span> に6桁のコードを送信しました
              </p>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                required
                autoFocus
                maxLength={6}
                style={{ ...inputStyle, fontSize: 24, letterSpacing: '0.3em', textAlign: 'center' }}
              />
            </div>
            {error && <p style={{ fontSize: 11, color: '#ef5350', margin: 0 }}>{error}</p>}
            <button type="submit" disabled={loading || code.length < 6} style={btnStyle(loading || code.length < 6)}>
              {loading ? '確認中…' : 'サインイン'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('email'); setCode(''); setError('') }}
              style={{ background: 'none', border: 'none', color: '#555', fontSize: 11, cursor: 'pointer', letterSpacing: '0.06em' }}
            >
              ← メールアドレスを変更
            </button>
          </form>
        )}

      </div>
    </div>
  )
}
