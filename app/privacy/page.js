export const metadata = {
  title: 'プライバシーポリシー | J.Leak Stats',
}

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 0', color: 'var(--text-primary)', lineHeight: 1.8 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 32 }}>プライバシーポリシー</h1>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.7)' }}>1. 基本方針</h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>
          J.Leak Stats（以下「当サイト」）は、ユーザーの個人情報の保護に努めます。本ポリシーは当サイトにおける個人情報の取り扱いについて説明するものです。
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.7)' }}>2. 広告について</h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>
          当サイトはGoogle AdSenseを利用しており、Googleおよびそのパートナーが広告の配信に際してCookieを使用することがあります。Cookieを使用することにより、ユーザーが当サイトや他のサイトを訪れた際の情報に基づいて適切な広告が表示されます。
        </p>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 8 }}>
          Googleによる広告Cookieの使用は、<a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Googleの広告に関するポリシー</a>に従います。ユーザーは<a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Googleの広告設定</a>でパーソナライズ広告を無効にできます。
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.7)' }}>3. アクセス解析</h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>
          当サイトはアクセス解析ツールを使用することがあります。これらのツールはトラフィックデータの収集のためにCookieを使用しますが、個人を特定する情報は含まれません。
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.7)' }}>4. 免責事項</h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>
          当サイトに掲載する情報は可能な限り正確を期していますが、その正確性・完全性を保証するものではありません。当サイトの情報を利用したことによって生じるいかなる損害についても、当サイトは責任を負いかねます。
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.7)' }}>5. 著作権</h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>
          当サイトに掲載されているコンテンツの著作権は当サイトに帰属します。無断転載・複製を禁じます。試合データはAPI-FOOTBALLより提供されています。
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.7)' }}>6. お問い合わせ</h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>
          本ポリシーに関するお問い合わせは<a href="/contact" style={{ color: 'var(--accent)' }}>お問い合わせページ</a>よりご連絡ください。
        </p>
      </section>

      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 48 }}>制定日：2026年4月</p>
    </div>
  )
}
