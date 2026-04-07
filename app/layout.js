import { ClerkProvider } from '@clerk/nextjs'
import { jaJP } from '@clerk/localizations'
import "./globals.css";

export const metadata = {
  title: "J.Leak Stats",
  description: "J1リーグの試合結果・順位表・AI予測・オッズ情報",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(d){var config={kitId:'bvx0wke',scriptTimeout:3000,async:true},h=d.documentElement,t=setTimeout(function(){h.className=h.className.replace(/\\bwf-loading\\b/g,"")+" wf-inactive";},config.scriptTimeout),tk=d.createElement("script"),f=false,s=d.getElementsByTagName("script")[0],a;h.className+=" wf-loading";tk.src='https://use.typekit.net/'+config.kitId+'.js';tk.async=true;tk.onload=tk.onreadystatechange=function(){a=this.readyState;if(f||a&&a!="complete"&&a!="loaded")return;f=true;clearTimeout(t);try{Typekit.load(config)}catch(e){}};s.parentNode.insertBefore(tk,s)})(document);` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Anta&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <ClerkProvider localization={jaJP} appearance={{
          variables: {
            colorBackground: '#111111',
            colorInputBackground: '#1a1a1a',
            colorInputText: '#ffffff',
            colorText: '#ffffff',
            colorTextSecondary: '#888888',
            colorPrimary: '#00ff87',
            colorDanger: '#ef5350',
            borderRadius: '0px',
            fontFamily: 'inherit',
          },
          elements: {
            card: { boxShadow: 'none', border: '1px solid #2a2a2a', backgroundColor: '#111111' },
            headerTitle: { color: '#ffffff', fontSize: '18px', fontWeight: '700', letterSpacing: '0.06em' },
            headerSubtitle: { color: '#666666' },
            formButtonPrimary: { backgroundColor: '#00ff87', color: '#000000', fontWeight: '700', letterSpacing: '0.06em', '&:hover': { backgroundColor: '#00cc6a' } },
            footerActionLink: { color: '#00ff87' },
            identityPreviewText: { color: '#ffffff' },
            formFieldLabel: { color: '#888888', fontSize: '11px', letterSpacing: '0.1em' },
            dividerLine: { backgroundColor: '#2a2a2a' },
            dividerText: { color: '#444444' },
            socialButtonsBlockButton: { border: '1px solid #2a2a2a', backgroundColor: '#1a1a1a', color: '#ffffff' },
          },
          layout: {
            logoPlacement: 'none',
          },
        }}>
          <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
            {children}
          </main>
          <footer style={{ borderTop: '1px solid var(--border-color)', color: 'var(--text-secondary)' }} className="text-center text-xs py-4">
            <div>© 2026 J.Leak Stats · データ提供: API-FOOTBALL</div>
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center', gap: 16 }}>
              <a href="/privacy" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>プライバシーポリシー</a>
              <a href="/contact" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>お問い合わせ</a>
            </div>
          </footer>
        </ClerkProvider>
      </body>
    </html>
  );
}
