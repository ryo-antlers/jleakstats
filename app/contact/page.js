export const metadata = {
  title: 'お問い合わせ | J.Leak Stats',
}

export default function ContactPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 0', color: 'var(--text-primary)', lineHeight: 1.8 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 16 }}>お問い合わせ</h1>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 32 }}>
        当サイトに関するご意見・ご要望・不具合報告などは、以下のフォームよりお送りください。
      </p>

      <iframe
        src="https://docs.google.com/forms/d/e/YOUR_FORM_ID/viewform?embedded=true"
        width="100%"
        height="600"
        frameBorder="0"
        style={{ border: 'none', borderRadius: 8 }}
      >
        読み込んでいます…
      </iframe>
    </div>
  )
}
