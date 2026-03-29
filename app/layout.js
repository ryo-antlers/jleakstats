import "./globals.css";

export const metadata = {
  title: "J.Leak Stats - J1リーグ データ可視化",
  description: "J1リーグの試合結果・順位表・AI予測・オッズ情報",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja" className="h-full">
      <body className="min-h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <header style={{ backgroundColor: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)' }}>
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
            <a href="/" className="text-xl font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
              J.Leak Stats
            </a>
            <nav className="flex gap-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <a href="/" className="hover:text-white transition-colors">ホーム</a>
              <a href="/standings" className="hover:text-white transition-colors">順位表</a>
            </nav>
          </div>
        </header>
        <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
          {children}
        </main>
        <footer style={{ borderTop: '1px solid var(--border-color)', color: 'var(--text-secondary)' }} className="text-center text-xs py-4">
          © 2026 J.Leak Stats · データ提供: API-FOOTBALL
        </footer>
      </body>
    </html>
  );
}
