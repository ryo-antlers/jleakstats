import { QUESTIONS } from './questions'
import { CLUBS } from './clubs'
import { TYPE_META, vectorToCode } from './type-meta'
import { emptyVector } from './axes'

/** 4軸スコア化 (16タイプ判定とバー表示に使用)。 */
export function scoreAnswers(answers) {
  const vec = emptyVector()
  const byId = new Map(QUESTIONS.map((q) => [q.id, q]))
  for (const a of answers) {
    const q = byId.get(a.questionId)
    if (!q) continue
    vec[q.axis] += a.step * q.direction
  }
  return vec
}

export const MAX_PER_AXIS = (() => {
  const counts = { shoubu: 0, keiei: 0, kansen: 0, kanshin: 0 }
  for (const q of QUESTIONS) counts[q.axis] += 1
  return {
    shoubu: counts.shoubu * 3,
    keiei: counts.keiei * 3,
    kansen: counts.kansen * 3,
    kanshin: counts.kanshin * 3,
  }
})()

const MAX_DIFF_PER_QUESTION = 6

/**
 * クラブのある質問への期待値。優先順位:
 *  1. questionOverrides[clubId][qid] (DB fantype_question_overrides、/admin/fantype-overrides で編集)
 *  2. club.overrides[qid] (clubs.js に直書き、レアケース)
 *  3. vector[axis] * direction (自動算出、-2〜+2 の範囲)
 */
export function clubExpectedAnswer(club, q, questionOverrides) {
  const fromDb = questionOverrides?.[club.id]?.[q.id]
  if (fromDb !== undefined) return fromDb
  const inline = club.overrides?.[q.id]
  if (inline !== undefined) return inline
  return club.vector[q.axis] * q.direction
}

/**
 * L1距離マッチング: 各質問でユーザー回答とクラブ期待値の差を取り、合計が小さいクラブほど良マッチ。
 *
 * @param {Answer[]} answers - ユーザーの 32問回答
 * @param {object} opts
 * @param {Club[]} [opts.clubs] - 評価対象のクラブ一覧 (vector overrides 適用済み)。省略時は基準 CLUBS
 * @param {object} [opts.questionOverrides] - DB から読んだ 質問単位 override (clubId→qid→value)
 * @param {number} [opts.top=3] - 上位何件を返すか
 */
export function matchClubs(answers, opts = {}) {
  const clubs = opts.clubs ?? CLUBS
  const questionOverrides = opts.questionOverrides ?? {}
  const top = opts.top ?? 3
  const qById = new Map(QUESTIONS.map((q) => [q.id, q]))
  const maxTotal = answers.length * MAX_DIFF_PER_QUESTION

  const scored = clubs.map((club) => {
    let distance = 0
    for (const a of answers) {
      const q = qById.get(a.questionId)
      if (!q) continue
      const expected = clubExpectedAnswer(club, q, questionOverrides)
      distance += Math.abs(a.step - expected)
    }
    const score = Math.max(0, 1 - distance / maxTotal)
    return { club, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, top)
}

export function diagnose(answers, opts = {}) {
  const vector = scoreAnswers(answers)
  const code = vectorToCode(vector)
  const type = TYPE_META[code]
  const matches = matchClubs(answers, { ...opts, top: 3 })
  return { code, vector, type, matches }
}

/**
 * URL 用エンコード。
 *
 * 各回答 -3..+3 を 0..6 (+3 シフト) にしたうえで、2回答を 1文字に詰める:
 *   pair = a1 * 7 + a2 (0..48)
 *   CHARSET[pair] = 1 char (a-zA-W = 49文字)
 *
 * 32問 → 16ペア → 16文字。旧形式 ("3_2_-1_...") も decode で読める (後方互換)。
 */
const CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVW' // 49 chars

export function encodeAnswers(answers) {
  const byId = new Map(answers.map((a) => [a.questionId, a.step]))
  const values = QUESTIONS.map((q) => (byId.get(q.id) ?? 0) + 3) // -3..+3 → 0..6
  let out = ''
  for (let i = 0; i < values.length; i += 2) {
    const pair = values[i] * 7 + (values[i + 1] ?? 0)
    out += CHARSET[pair]
  }
  return out
}

export function decodeAnswers(s) {
  if (!s) return null

  // 旧形式 (アンダースコア区切り) は後方互換のため引き続き受ける
  if (s.includes('_')) {
    const parts = s.split('_').map((p) => Number(p))
    if (parts.length !== QUESTIONS.length) return null
    if (parts.some((n) => !Number.isInteger(n) || n < -3 || n > 3)) return null
    return QUESTIONS.map((q, i) => ({ questionId: q.id, step: parts[i] }))
  }

  // 新形式: 16文字、各文字は CHARSET[0..48]
  const expectedLen = Math.ceil(QUESTIONS.length / 2)
  if (s.length !== expectedLen) return null
  const values = []
  for (const c of s) {
    const idx = CHARSET.indexOf(c)
    if (idx < 0 || idx > 48) return null
    values.push(Math.floor(idx / 7))
    values.push(idx % 7)
  }
  // 32問ぶんを切り出し
  return QUESTIONS.map((q, i) => ({ questionId: q.id, step: values[i] - 3 }))
}

/**
 * 4軸ベクトルから「典型ユーザー」の32問回答を合成。
 * URLに ?a= が無い時 (例: タイプコード直リンク) のフォールバック用。
 */
export function syntheticAnswersFromVector(v) {
  return QUESTIONS.map((q) => {
    const raw = v[q.axis] * q.direction
    const clamped = Math.max(-3, Math.min(3, Math.round(raw)))
    return { questionId: q.id, step: clamped }
  })
}
