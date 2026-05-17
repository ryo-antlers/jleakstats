'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { QUESTIONS } from '@/lib/jlsp/questions'
import { scoreAnswers, encodeAnswers } from '@/lib/jlsp/diagnose'
import { vectorToCode } from '@/lib/jlsp/type-meta'

const QUESTIONS_PER_PAGE = 8

const STEPS = [
  { value: +3, label: '強く賛成' },
  { value: +2, label: '賛成' },
  { value: +1, label: 'やや賛成' },
  { value: 0, label: 'どちらでもない' },
  { value: -1, label: 'やや反対' },
  { value: -2, label: '反対' },
  { value: -3, label: '強く反対' },
]

const CENTER_INDEX = 3

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
    <div
      className="rounded-2xl border border-zinc-800 p-4 sm:p-5"
      style={{ backgroundColor: 'var(--bg-secondary)' }}
    >
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-xs text-zinc-500 font-mono">Q{index}</span>
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          {axisLabel(question.axis)}
        </span>
      </div>
      <p className="text-sm sm:text-base font-semibold leading-relaxed mb-5 text-white">
        {question.statement}
      </p>
      <div className="flex items-center gap-2 sm:gap-3 select-none">
        <span className="text-[10px] sm:text-xs font-semibold text-zinc-500 shrink-0 w-8">
          賛成
        </span>
        <div className="flex-1 grid grid-cols-7 gap-1 sm:gap-1.5">
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
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => onSelect(s.value)}
                aria-label={s.label}
                title={s.label}
                aria-pressed={isExact}
                style={
                  isFilled
                    ? {
                        backgroundColor: isExact ? 'var(--accent)' : 'var(--accent-dark)',
                      }
                    : undefined
                }
                className={`h-9 sm:h-11 rounded transition-all duration-150 ${
                  isFilled ? '' : 'bg-zinc-800 hover:bg-zinc-700'
                }`}
              />
            )
          })}
        </div>
        <span className="text-[10px] sm:text-xs font-semibold text-zinc-500 shrink-0 w-8 text-right">
          反対
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
      router.push(`/jlsp/result/${code}?a=${a}`)
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

      <div className="space-y-3">
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
