import sql from '@/lib/db'

const AXIS_IDS = ['shoubu', 'soshiki', 'keiei', 'nekkyou']

function isValidValue(n) {
  return typeof n === 'number' && Number.isInteger(n) && n >= -2 && n <= 2
}

function isValidAxis(s) {
  return typeof s === 'string' && AXIS_IDS.includes(s)
}

/**
 * GET: 全クラブの vector override を { clubId: { axisId: value } } 形式で返す
 */
export async function GET() {
  const rows = await sql`
    SELECT club_id, axis_id, value FROM jlsp_vector_overrides
  `.catch(() => [])
  const out = {}
  for (const r of rows) {
    if (!out[r.club_id]) out[r.club_id] = {}
    out[r.club_id][r.axis_id] = Number(r.value)
  }
  return Response.json(out)
}

/**
 * POST: { clubId, vector: { axisId: value, ... } }
 *   - vector が空オブジェクト → そのクラブの override 行をすべて削除
 *   - そうでなければ、送られた軸だけ UPSERT、未指定の軸は削除
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

  const { clubId, vector } = body

  if (typeof clubId !== 'string' || !clubId) {
    return Response.json({ error: 'missing_clubId' }, { status: 400 })
  }

  if (!vector || typeof vector !== 'object' || Array.isArray(vector)) {
    return Response.json({ error: 'invalid_vector' }, { status: 400 })
  }

  const validated = {}
  for (const [axis, val] of Object.entries(vector)) {
    if (!isValidAxis(axis)) {
      return Response.json({ error: 'invalid_axis', axis }, { status: 400 })
    }
    if (!isValidValue(val)) {
      return Response.json({ error: 'invalid_value', axis, val }, { status: 400 })
    }
    validated[axis] = val
  }

  const sentAxes = Object.keys(validated)

  // 空 → 全削除
  if (sentAxes.length === 0) {
    await sql`DELETE FROM jlsp_vector_overrides WHERE club_id = ${clubId}`
    return Response.json({ ok: true, clubId, deleted: 'all' })
  }

  // 送られた軸を UPSERT、それ以外の軸は削除
  await sql`
    DELETE FROM jlsp_vector_overrides
    WHERE club_id = ${clubId} AND NOT (axis_id = ANY(${sentAxes}))
  `
  for (const [axis, val] of Object.entries(validated)) {
    await sql`
      INSERT INTO jlsp_vector_overrides (club_id, axis_id, value)
      VALUES (${clubId}, ${axis}, ${val})
      ON CONFLICT (club_id, axis_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
  }
  return Response.json({ ok: true, clubId })
}
