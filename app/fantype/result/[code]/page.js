import { notFound } from 'next/navigation'
import { TYPE_META } from '@/lib/fantype/type-meta'
import { AXES } from '@/lib/fantype/axes'
import {
  decodeAnswers,
  scoreAnswers,
  syntheticAnswersFromVector,
  MAX_PER_AXIS,
} from '@/lib/fantype/diagnose'
import ShareButtons from './ShareButtons'
import SaveButton from './SaveButton'

export function generateStaticParams() {
  return Object.keys(TYPE_META).map((code) => ({ code }))
}

export async function generateMetadata({ params }) {
  const { code } = await params
  const type = TYPE_META[code.toUpperCase()]
  if (!type) return { title: 'FANTYPE' }
  const title = `${type.code} ${type.nickname} | FANTYPE`
  const description = `${type.tagline} - ${type.description}`
  const ogImage = `/api/fantype/og/${type.code}`
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'FANTYPE | J.Leak Stats',
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${type.code} ${type.nickname}` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  }
}

export default async function FantypeResultPage({ params, searchParams }) {
  const { code: codeRaw } = await params
  const { a } = await searchParams
  const code = codeRaw.toUpperCase()
  const type = TYPE_META[code]
  if (!type) notFound()

  // ?a= があれば32問の生回答からスコア化。なければtypeの代表ベクトルから合成。
  const answers = (a ? decodeAnswers(a) : null) ?? syntheticAnswersFromVector(type.vector)
  const vector = scoreAnswers(answers)

  return (
    <div className="mx-auto max-w-3xl w-full">
      <p className="text-xs text-zinc-500">あなたの FANTYPE</p>
      <div className="mt-2 flex items-baseline gap-3 flex-wrap">
        <h1
          className="text-5xl sm:text-6xl font-black tracking-tight"
          style={{ color: 'var(--accent)' }}
        >
          {type.code}
        </h1>
        <span className="text-2xl sm:text-3xl font-bold text-white">
          {type.nickname}
        </span>
      </div>
      <p className="mt-3 text-base sm:text-lg font-semibold text-white">{type.tagline}</p>
      <p className="mt-3 text-sm sm:text-base text-zinc-400 leading-relaxed">
        {type.description}
      </p>

      <section className="mt-10">
        <h2 className="text-base sm:text-lg font-bold mb-4 text-white">
          あなたの4軸スコア
        </h2>
        <div className="space-y-3">
          {AXES.map((axis) => {
            const value = vector[axis.id]
            const max = MAX_PER_AXIS[axis.id] || 1
            const pct = Math.max(-100, Math.min(100, (value / max) * 100))
            const positive = pct >= 0
            return (
              <div key={axis.id}>
                <div className="grid grid-cols-3 text-xs mb-1">
                  {/* + 側 (R/W/U/O) を左、- 側 (E/H/A/F) を右に。grid-cols-3 で 3列 1fr 等分 → 中央ラベルが真ん中に揃う */}
                  <span style={{ color: 'var(--accent)' }}>
                    {axis.positive.letter} {axis.positive.name}
                  </span>
                  <span className="text-zinc-500 text-center">{axis.label}</span>
                  <span className="text-fuchsia-400 text-right">
                    {axis.negative.name} {axis.negative.letter}
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-600" />
                  {/* + 値は中央から左、- 値は中央から右に伸びる (= ラベルと位置が一致) */}
                  <div
                    className={`absolute inset-y-0 ${positive ? 'right-1/2' : 'left-1/2'}`}
                    style={{
                      width: `${Math.abs(pct) / 2}%`,
                      backgroundColor: positive ? 'var(--accent)' : '#d946ef',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* a (= 32問の回答) が URL に含まれているときだけ「保存」を出す。
          /fantype/result/[code] 直リンク (?a= なし) は合成回答なので保存しない */}
      {a && (
        <section className="mt-10 sm:mt-12 flex justify-end">
          <SaveButton code={type.code} answers={a} />
        </section>
      )}

      <section className="mt-8 sm:mt-10">
        <ShareButtons
          code={type.code}
          shareText={`私の FANTYPE は ${type.code}「${type.nickname}」でした。\n${type.tagline}\nあなたも診断してみよう👇`}
        />
      </section>
    </div>
  )
}
