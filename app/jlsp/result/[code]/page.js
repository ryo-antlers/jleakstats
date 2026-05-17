import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TYPE_META } from '@/lib/jlsp/type-meta'
import { AXES } from '@/lib/jlsp/axes'
import {
  decodeAnswers,
  matchClubs,
  scoreAnswers,
  syntheticAnswersFromVector,
  MAX_PER_AXIS,
} from '@/lib/jlsp/diagnose'
import { loadJlspState } from '@/lib/jlsp/loader'
import ShareButtons from './ShareButtons'

// DB の override が即時反映されるように revalidate を無効化
export const revalidate = 0

export function generateStaticParams() {
  return Object.keys(TYPE_META).map((code) => ({ code }))
}

export async function generateMetadata({ params }) {
  const { code } = await params
  const type = TYPE_META[code.toUpperCase()]
  if (!type) return { title: 'JLSP診断' }
  const title = `${type.code} ${type.nickname} | JLSP診断`
  const description = `${type.tagline} - ${type.description}`
  // OGP 画像は Step3 後半で /api/jlsp/og/[code] に差し替え予定
  const ogImage = `/api/jlsp/og/${type.code}`
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'JLSP診断 | J.Leak Stats',
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

export default async function JlspResultPage({ params, searchParams }) {
  const { code: codeRaw } = await params
  const { a } = await searchParams
  const code = codeRaw.toUpperCase()
  const type = TYPE_META[code]
  if (!type) notFound()

  // ?a= があれば32問の生回答からマッチング。なければtypeの代表ベクトルから合成。
  const answers = (a ? decodeAnswers(a) : null) ?? syntheticAnswersFromVector(type.vector)
  const vector = scoreAnswers(answers)
  const { clubs, questionOverrides, teamIdByClubId } = await loadJlspState()
  const matches = matchClubs(answers, { clubs, questionOverrides, top: 3 })

  return (
    <div className="mx-auto max-w-3xl w-full">
      <p className="text-xs text-zinc-500">あなたの JLSP タイプ</p>
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
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-fuchsia-400">
                    {axis.negative.letter} {axis.negative.name}
                  </span>
                  <span className="text-zinc-500">{axis.label}</span>
                  <span style={{ color: 'var(--accent)' }}>
                    {axis.positive.name} {axis.positive.letter}
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-600" />
                  <div
                    className={`absolute inset-y-0 ${positive ? 'left-1/2' : 'right-1/2'}`}
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

      <section className="mt-10 sm:mt-12">
        <h2 className="text-base sm:text-lg font-bold mb-4 text-white">
          あなたへのおすすめJクラブ TOP3
        </h2>
        <div className="space-y-4">
          {matches.map((m, i) => {
            const teamId = teamIdByClubId[m.club.id]
            const card = (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-2xl font-black" style={{ color: m.club.color }}>
                      #{i + 1}
                    </span>
                    <h3 className="text-lg sm:text-xl font-bold text-white">{m.club.name}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                      {m.club.division} / {m.club.prefecture}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-zinc-500">相性</div>
                    <div className="font-bold" style={{ color: 'var(--accent)' }}>
                      {Math.round(m.score * 100)}%
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
                  {m.club.description}
                </p>
                <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  {m.club.stadiumGourmet && (
                    <div>
                      <dt className="text-zinc-500">スタグル</dt>
                      <dd className="text-zinc-300">{m.club.stadiumGourmet}</dd>
                    </div>
                  )}
                  {m.club.sightseeing && (
                    <div>
                      <dt className="text-zinc-500">遠征の楽しみ</dt>
                      <dd className="text-zinc-300">{m.club.sightseeing}</dd>
                    </div>
                  )}
                  {m.club.mascot && (
                    <div>
                      <dt className="text-zinc-500">マスコット</dt>
                      <dd className="text-zinc-300">{m.club.mascot}</dd>
                    </div>
                  )}
                </dl>
                {teamId && (
                  <div className="mt-3 text-xs" style={{ color: 'var(--accent)' }}>
                    クラブ詳細ページへ →
                  </div>
                )}
              </>
            )
            const className =
              'block rounded-2xl border border-zinc-800 p-4 sm:p-5 transition-colors hover:border-zinc-600'
            const style = { backgroundColor: 'var(--bg-secondary)' }
            return teamId ? (
              <Link key={m.club.id} href={`/team/${teamId}`} className={className} style={style}>
                {card}
              </Link>
            ) : (
              <article key={m.club.id} className={className} style={style}>
                {card}
              </article>
            )
          })}
        </div>
      </section>

      <section className="mt-10 sm:mt-12">
        <ShareButtons
          code={type.code}
          shareText={`私のJLSP診断は ${type.code}「${type.nickname}」でした。\n${type.tagline}\nあなたも診断してみよう👇`}
        />
      </section>

      <section className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/jlsp/quiz"
          style={{ backgroundColor: 'var(--accent)', color: '#000' }}
          className="inline-flex items-center justify-center rounded-full font-semibold px-6 py-3 hover:opacity-90"
        >
          もう一度診断する
        </Link>
        <Link
          href="/jlsp"
          className="inline-flex items-center justify-center rounded-full border border-zinc-700 text-white px-6 py-3 hover:bg-zinc-800"
        >
          診断トップへ
        </Link>
      </section>
    </div>
  )
}
