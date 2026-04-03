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
      </head>
      <body className="min-h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
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
