import Link from 'next/link'

export const metadata = {
  title: 'JLSP診断 | Jリーグ クラブ相性診断',
  description:
    'あなたのサポーター気質を 16タイプで診断、Jリーグ全60クラブから相性の高いクラブを発見できます。',
}

const AXES_DETAIL = [
  {
    num: '01',
    label: '勝負観',
    left: { letter: 'R', name: '勝利至上' },
    right: { letter: 'E', name: '美学' },
    desc: '結果か、内容か。',
  },
  {
    num: '02',
    label: '組織観',
    left: { letter: 'S', name: '組織・規律' },
    right: { letter: 'I', name: '個性・閃き' },
    desc: '戦術か、スターか。',
  },
  {
    num: '03',
    label: '経営観',
    left: { letter: 'W', name: 'マネー派' },
    right: { letter: 'H', name: 'ハート派' },
    desc: '補強か、育成か。',
  },
  {
    num: '04',
    label: '熱狂度',
    left: { letter: 'F', name: '穏やか派' },
    right: { letter: 'U', name: '過激派' },
    desc: 'じっくりか、熱狂か。',
  },
]

export default function JlspTopPage() {
  return (
    <div>
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <p className="text-xs tracking-[0.4em] font-semibold text-zinc-100 mb-6">
          J.LEAGUE × 16 TYPES
        </p>
        <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.05] text-white">
          日本にも、
          <br />
          <span className="club-color-cycle">あなたのクラブ</span>
          がある。
        </h1>
        <p className="mt-6 text-sm sm:text-base text-zinc-400 leading-relaxed max-w-xl">
          あなたのサポーター気質を 16タイプで診断、Jリーグ全60クラブから相性の高いクラブを発見できます。
        </p>
        <div className="mt-8 flex items-center gap-5 flex-wrap">
          <Link
            href="/jlsp/quiz"
            style={{ backgroundColor: 'var(--accent)', color: '#000' }}
            className="inline-flex items-center justify-center rounded-full font-bold text-sm sm:text-base px-7 py-3.5 transition-opacity hover:opacity-90"
          >
            診断をはじめる →
          </Link>
          <span className="text-xs text-zinc-500">所要時間 約3分</span>
        </div>
      </section>

      {/* 4 Axes */}
      <section className="py-12 border-t border-zinc-800">
        <div className="flex items-baseline gap-3 mb-8">
          <span className="text-xs tracking-[0.3em] font-semibold text-zinc-500">
            4 AXES
          </span>
          <span className="text-xs text-zinc-500">— 診断の評価軸</span>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
          {AXES_DETAIL.map((a) => (
            <article
              key={a.num}
              className="group relative rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6 overflow-hidden transition-colors"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
            >
              <span className="absolute top-3 right-5 text-5xl sm:text-6xl font-black tracking-tighter select-none text-zinc-900">
                {a.num}
              </span>

              <div className="relative">
                <div className="text-xs tracking-[0.3em] font-semibold text-zinc-500 mb-5">
                  AXIS {a.num}
                </div>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight mb-5 text-white">
                  {a.label}
                </h2>

                <div className="flex items-baseline justify-between mb-3">
                  <div>
                    <span
                      className="text-2xl sm:text-3xl font-black"
                      style={{ color: 'var(--accent)' }}
                    >
                      {a.left.letter}
                    </span>
                    <span className="ml-2 text-xs sm:text-sm font-medium text-zinc-400">
                      {a.left.name}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs sm:text-sm font-medium text-zinc-400">
                      {a.right.name}
                    </span>
                    <span className="ml-2 text-2xl sm:text-3xl font-black text-zinc-500">
                      {a.right.letter}
                    </span>
                  </div>
                </div>
                <div
                  className="h-px mb-4"
                  style={{
                    background:
                      'linear-gradient(to right, var(--accent), #444, #333)',
                  }}
                />
                <p className="text-xs sm:text-sm text-zinc-400">{a.desc}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="py-12 text-xs text-zinc-500">
        ※ 本サービスは非公式の診断コンテンツです。Jリーグおよび各クラブとは一切関係ありません。
      </section>
    </div>
  )
}
