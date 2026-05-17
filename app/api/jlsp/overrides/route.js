import sql from '@/lib/db'

function isValidValue(n) {
  return typeof n === 'number' && Number.isInteger(n) && n >= -3 && n <= 3
}

/**
 * GET: 全クラブの 質問単位 override を { clubId: { questionId: value } } 形式で返す
 */
export async function GET() {
  const rows = await sql`
    SELECT club_id, question_id, value FROM jlsp_question_overrides
  `.catch(() => [])
  const out = {}
  for (const r of rows) {
    if (!out[r.club_id]) out[r.club_id] = {}
    out[r.club_id][r.question_id] = Number(r.value)
  }
  return Response.json(out)
}

/**
 * POST: { clubId, overrides: { questionId: value, ... } }
 *   - overrides が空オブジェクト → そのクラブの override 行をすべて削除
 *   - そうでなければ、送られた質問だけ UPSERT、未指定の質問は削除
 */
export async function POST(req) {
  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'invalid_body' }, { status: 400 })
  }

  const { clubId, overrides } = body

  if (typeof clubId !== 'string' || !clubId) {
    return Response.json({ error: 'missing_clubId' }, { status: 400 })
  }

  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    return Response.json({ error: 'invalid_overrides' }, { status: 400 })
  }

  const validated = {}
  for (const [qid, val] of Object.entries(overrides)) {
    if (!isValidValue(val)) {
      return Response.json({ error: 'invalid_value', qid, val }, { status: 400 })
    }
    validated[qid] = val
  }

  const sentQids = Object.keys(validated)

  if (sentQids.length === 0) {
    await sql`DELETE FROM jlsp_question_overrides WHERE club_id = ${clubId}`
    return Response.json({ ok: true, clubId, deleted: 'all' })
  }

  await sql`
    DELETE FROM jlsp_question_overrides
    WHERE club_id = ${clubId} AND NOT (question_id = ANY(${sentQids}))
  `
  for (const [qid, val] of Object.entries(validated)) {
    await sql`
      INSERT INTO jlsp_question_overrides (club_id, question_id, value)
      VALUES (${clubId}, ${qid}, ${val})
      ON CONFLICT (club_id, question_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
  }
  return Response.json({ ok: true, clubId, count: sentQids.length })
}
