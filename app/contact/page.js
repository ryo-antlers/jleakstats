export const metadata = {
  title: 'お問い合わせ | J.Leak Stats',
}

export default function ContactPage() {
  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 0', color: 'var(--text-primary)' }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>お問い合わせ</h1>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 40, lineHeight: 1.7 }}>
        当サイトに関するご意見・ご要望・不具合報告などはこちらからどうぞ。
      </p>

      <form
        action="https://docs.google.com/forms/d/e/1FAIpQLScIuE4Q_WwNTzBrMTbf9Z5SQcmRLJKBjN7T-fuJJYNH2d75Qg/formResponse"
        method="POST"
        target="_blank"
        style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>お名前</label>
          <input
            type="text"
            name="entry.878712384"
            required
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              padding: '12px 16px',
              color: '#fff',
              fontSize: 14,
              outline: 'none',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>メールアドレス</label>
          <input
            type="email"
            name="entry.385541614"
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              padding: '12px 16px',
              color: '#fff',
              fontSize: 14,
              outline: 'none',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>お問い合わせ内容</label>
          <textarea
            name="entry.868493032"
            required
            rows={6}
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              padding: '12px 16px',
              color: '#fff',
              fontSize: 14,
              outline: 'none',
              width: '100%',
              boxSizing: 'border-box',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        </div>

        <button
          type="submit"
          style={{
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '14px 32px',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            alignSelf: 'flex-start',
            letterSpacing: '0.05em',
          }}
        >
          送信
        </button>
      </form>
    </div>
  )
}
