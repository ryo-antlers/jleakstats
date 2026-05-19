import Link from 'next/link'
import DecodeText from './DecodeText'

export const metadata = {
  title: 'FANTYPE | サポーター気質 16タイプ診断',
  description:
    'あなたのサポーター気質を 16タイプで診断。サッカー観の自己分析、本格的なJ.LEAGUE版 MBTI。',
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
    label: '経営観',
    left: { letter: 'W', name: '補強派' },
    right: { letter: 'H', name: '育成派' },
    desc: 'スター獲得か、生え抜きか。',
  },
  {
    num: '03',
    label: '観戦観',
    left: { letter: 'U', name: '熱狂派' },
    right: { letter: 'A', name: '分析派' },
    desc: 'チャントか、黙考か。',
  },
  {
    num: '04',
    label: '関心軸',
    left: { letter: 'O', name: '試合派' },
    right: { letter: 'F', name: 'カルチャー派' },
    desc: '90分か、365日か。',
  },
]

export default function FantypeTopPage() {
  return (
    <div>
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <p className="text-xs tracking-[0.4em] font-semibold text-zinc-100 mb-6">
          FANTYPE × J.LEAGUE × 16 TYPES
        </p>
        <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.1] text-white">
          あなたの<br />
          サポーター気質を、<br />
          <DecodeText
            text="解読する。"
            intervalMs={3600}
            style={{ color: 'var(--accent)' }}
          />
        </h1>
        <p className="mt-6 text-sm sm:text-base text-zinc-400 leading-relaxed max-w-xl">
          あなたはどんなサッカーファン? 32問の質問から、勝負・経営・観戦・関心の 4 つの観点を測定。同じユニフォームを着ていても、応援の温度は 16 通りある。
        </p>
        <div className="mt-8 flex items-center gap-5 flex-wrap">
          <Link
            href="/fantype/quiz"
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
              className="group relative p-5 sm:p-6 overflow-hidden"
            >
              <span
                className="absolute top-3 right-5 text-5xl sm:text-6xl font-black tracking-tighter select-none"
                style={{ color: 'rgba(255,255,255,0.12)' }}
              >
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
