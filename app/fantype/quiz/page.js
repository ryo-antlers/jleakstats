'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { QUESTIONS } from '@/lib/jlsp/questions'
import { scoreAnswers, encodeAnswers } from '@/lib/jlsp/diagnose'
import { vectorToCode } from '@/lib/jlsp/type-meta'

const QUESTIONS_PER_PAGE = 8

// 反対 (左) → どちらでもない (中央) → 賛成 (右) の順に並べる
const STEPS = [
  { value: -3, label: '強く反対' },
  { value: -2, label: '反対' },
  { value: -1, label: 'やや反対' },
  { value: 0, label: 'どちらでもない' },
  { value: +1, label: 'やや賛成' },
  { value: +2, label: '賛成' },
  { value: +3, label: '強く賛成' },
]

const CENTER_INDEX = 3

// 各ステップの塗りつぶし色 (選択時): 反対側=紫、中央=グレー、賛成側=緑
const STEP_COLORS = [
  '#9333ea', // 強く反対 (purple-600)
  '#a855f7', // 反対 (purple-500)
  '#c084fc', // やや反対 (purple-400)
  '#6b7280', // どちらでもない (gray-500)
  '#4ade80', // やや賛成 (green-400)
  '#22c55e', // 賛成 (green-500)
  '#16a34a', // 強く賛成 (green-600)
]

// 未選択時のボーダー色 (左右で色分け)
const STEP_BORDER_COLORS = [
  'rgba(168, 85, 247, 0.6)', // 反対側 (purple)
  'rgba(168, 85, 247, 0.6)',
  'rgba(168, 85, 247, 0.6)',
  'rgb(91, 94, 100)',         // 中央 (gray)
  'rgba(34, 197, 94, 0.6)',   // 賛成側 (green)
  'rgba(34, 197, 94, 0.6)',
  'rgba(34, 197, 94, 0.6)',
]

// 各ステップの箱サイズ: 中央が小さく、両端ほど大きく (=熱量の表現)
const STEP_SIZE = [
  'w-10 h-10 sm:w-12 sm:h-12', // 強く反対
  'w-8 h-8 sm:w-10 sm:h-10',   // 反対
  'w-7 h-7 sm:w-8 sm:h-8',     // やや反対
  'w-6 h-6 sm:w-7 sm:h-7',     // どちらでもない
  'w-7 h-7 sm:w-8 sm:h-8',     // やや賛成
  'w-8 h-8 sm:w-10 sm:h-10',   // 賛成
  'w-10 h-10 sm:w-12 sm:h-12', // 強く賛成
]

function axisLabel(axis) {
  switch (axis) {
    case 'shoubu':
      return '勝負観'
    case 'soshiki':
      return '組織観'
    case 'keiei':
      return '経営観'
    case 'nekkyou':
      return '熱狂度'
    default:
      return ''
  }
}

function LikertRow({ index, question, selected, onSelect }) {
  return (
    <div className="py-2 sm:py-3">
      <div className="flex items-baseline gap-3 mb-8 sm:mb-10">
        <span className="text-xs text-zinc-500 font-mono shrink-0">Q{index}</span>
        <p className="text-sm sm:text-base font-semibold leading-relaxed text-white">
          {question.statement}
        </p>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 select-none">
        <span className="text-[10px] sm:text-xs font-semibold text-zinc-500 shrink-0">
          反対
        </span>
        <div className="flex items-center" style={{ gap: '20px' }}>
          {STEPS.map((s, i) => {
            const selectedIdx =
              selected !== undefined ? STEPS.findIndex((x) => x.value === selected) : -1
            let isFilled = false
            if (selectedIdx !== -1) {
              if (selectedIdx <= CENTER_INDEX && i >= selectedIdx && i <= CENTER_INDEX) {
                isFilled = true
              }
              if (selectedIdx >= CENTER_INDEX && i <= selectedIdx && i >= CENTER_INDEX) {
                isFilled = true
              }
            }
            const isExact = selected === s.value
            const color = STEP_COLORS[i]
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => onSelect(s.value)}
                aria-label={s.label}
                title={s.label}
                aria-pressed={isExact}
                style={{
                  backgroundColor: isFilled ? color : 'transparent',
                  border: `2px solid ${isFilled ? color : STEP_BORDER_COLORS[i]}`,
                  WebkitTapHighlightColor: 'transparent',
                }}
                className={`${STEP_SIZE[i]} rounded transition-all duration-150 hover:scale-105 cursor-pointer focus:outline-none focus-visible:outline-none active:outline-none`}
              />
            )
          })}
        </div>
        <span className="text-[10px] sm:text-xs font-semibold text-zinc-500 shrink-0">
          賛成
        </span>
      </div>
    </div>
  )
}

export default function JlspQuizPage() {
  const router = useRouter()
  const pages = useMemo(() => {
    const out = []
    for (let i = 0; i < QUESTIONS.length; i += QUESTIONS_PER_PAGE) {
      out.push(QUESTIONS.slice(i, i + QUESTIONS_PER_PAGE))
    }
    return out
  }, [])
  const totalPages = pages.length

  const [pageIndex, setPageIndex] = useState(0)
  const [answers, setAnswers] = useState(new Map())
  const topRef = useRef(null)

  const currentPage = pages[pageIndex]
  const answeredOnPage = currentPage.every((q) => answers.has(q.id))
  const isLastPage = pageIndex === totalPages - 1
  const startQ = pageIndex * QUESTIONS_PER_PAGE + 1
  const endQ = startQ + currentPage.length - 1
  const progress = Math.round((answers.size / QUESTIONS.length) * 100)

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [pageIndex])

  function setAnswer(qid, step) {
    setAnswers((prev) => {
      const next = new Map(prev)
      next.set(qid, step)
      return next
    })
  }

  function goNext() {
    if (!answeredOnPage) return
    if (isLastPage) {
      const payload = QUESTIONS.map((q) => ({
        questionId: q.id,
        step: answers.get(q.id) ?? 0,
      }))
      const vector = scoreAnswers(payload)
      const code = vectorToCode(vector)
      const a = encodeAnswers(payload)
      router.push(`/fantype/result/${code}?a=${a}`)
    } else {
      setPageIndex(pageIndex + 1)
    }
  }

  function goBack() {
    if (pageIndex > 0) setPageIndex(pageIndex - 1)
  }

  return (
    <div className="mx-auto max-w-2xl w-full">
      <div ref={topRef} />

      <div className="mb-6">
        <div className="flex justify-between text-xs text-zinc-500 mb-2">
          <span>
            Q{startQ}–{endQ} / {QUESTIONS.length}
          </span>
          <span>
            {pageIndex + 1} / {totalPages} ページ
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full transition-all"
            style={{ width: `${progress}%`, backgroundColor: 'var(--accent)' }}
          />
        </div>
      </div>

      <div className="space-y-6 sm:space-y-7">
        {currentPage.map((q, i) => (
          <LikertRow
            key={q.id}
            index={startQ + i}
            question={q}
            selected={answers.get(q.id)}
            onSelect={(step) => setAnswer(q.id, step)}
          />
        ))}
      </div>

      <div className="mt-8 flex justify-between items-center">
        <button
          type="button"
          onClick={goBack}
          disabled={pageIndex === 0}
          className="text-sm text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ← 前のページ
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={!answeredOnPage}
          style={
            answeredOnPage
              ? { backgroundColor: 'var(--accent)', color: '#000' }
              : { backgroundColor: '#333', color: '#666' }
          }
          className="inline-flex items-center justify-center rounded-full font-semibold px-6 py-3 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
        >
          {isLastPage ? '結果を見る →' : '次のページ →'}
        </button>
      </div>

      {!answeredOnPage && (
        <p className="mt-3 text-right text-xs text-zinc-500">
          このページの {currentPage.length} 問すべてに回答してください
        </p>
      )}
    </div>
  )
}
