import { auth } from '@clerk/nextjs/server'
import sql from '@/lib/db'
import { containsNG } from '@/lib/ng-words'

const WATCH_TYPES = ['stadium', 'streaming']
const NEXT_VISIT_MEMO_MAX = 500
const MATCH_IMPRESSION_MAX = 500
const TIMELINE_MAX_ENTRIES = 30
const TIMELINE_TEXT_MAX = 100
const TIME_HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

// GET /api/watch-notes?fixture_id=...  自分のノート (1 件)
// GET /api/watch-notes?user_id=...     他ユーザーのノート一覧 (ログイン必須)
export async function GET(request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const fixtureIdRaw = searchParams.get('fixture_id')
  const targetUserId = searchParams.get('user_id')
  const handle = searchParams.get('handle')
  const limitRaw = searchParams.get('limit')

  // (1) 自分の単一ノート
  if (fixtureIdRaw) {
    const fid = Number(fixtureIdRaw)
    if (!Number.isInteger(fid) || fid <= 0) {
      return Response.json({ error: 'Invalid fixture_id' }, { status: 400 })
    }
    const rows = await sql`
      SELECT id, fixture_id, watch_type, match_impression, next_visit_memo, timeline,
             created_at, updated_at
      FROM watch_notes
      WHERE clerk_user_id = ${userId} AND fixture_id = ${fid}
    `
    return Response.json({ note: rows[0] ?? null })
  }

  // (2) 他ユーザーのノート一覧
  if (targetUserId || handle) {
    let resolvedUserId = targetUserId
    if (!resolvedUserId && handle) {
      const r = await sql`SELECT clerk_user_id FROM user_profiles WHERE handle = ${handle}`
      if (r.length === 0) return Response.json({ notes: [] })
      resolvedUserId = r[0].clerk_user_id
    }
    const limit = Math.min(Math.max(Number(limitRaw) || 6, 1), 50)
    const rows = await sql`
      SELECT wn.id, wn.fixture_id, wn.watch_type, wn.match_impression, wn.next_visit_memo, wn.timeline,
             wn.created_at, wn.updated_at,
             f.date AS fixture_date, f.home_team_id, f.away_team_id,
             f.home_score, f.away_score, f.home_penalty, f.away_penalty,
             f.status, f.league_id, f.round_number,
             ht.abbr AS home_abbr, ht.short_name AS home_short, ht.name_ja AS home_name, ht.color_primary AS home_color,
             at.abbr AS away_abbr, at.short_name AS away_short, at.name_ja AS away_name, at.color_primary AS away_color
      FROM watch_notes wn
      JOIN fixtures f ON f.id = wn.fixture_id
      LEFT JOIN teams_master ht ON ht.id = f.home_team_id
      LEFT JOIN teams_master at ON at.id = f.away_team_id
      WHERE wn.clerk_user_id = ${resolvedUserId}
      ORDER BY f.date DESC
      LIMIT ${limit}
    `
    return Response.json({ notes: rows })
  }

  return Response.json({ error: 'Specify fixture_id or user_id/handle' }, { status: 400 })
}

// POST /api/watch-notes  自分のノートを upsert
//   body: { fixture_id, watch_type, match_impression?, next_visit_memo?, timeline? }
export async function POST(request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: '不正なリクエストボディ' }, { status: 400 })
  }

  const fixtureId = Number(body.fixture_id)
  if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
    return Response.json({ error: 'fixture_id が不正です' }, { status: 400 })
  }

  const watchType = String(body.watch_type ?? '')
  if (!WATCH_TYPES.includes(watchType)) {
    return Response.json({ error: '観戦区分が不正です' }, { status: 400 })
  }

  // match_impression: 試合の感想 (stadium/streaming 両方で表示)、500 字、NG ワード弾く
  let matchImpression = null
  if (body.match_impression != null) {
    const m = String(body.match_impression).trim()
    if (m.length > 0) {
      if ([...m].length > MATCH_IMPRESSION_MAX) {
        return Response.json({ error: `試合の感想は${MATCH_IMPRESSION_MAX}文字以内` }, { status: 400 })
      }
      if (containsNG(m)) {
        return Response.json({ error: '試合の感想に使用できない言葉が含まれています' }, { status: 400 })
      }
      matchImpression = m
    }
  }

  // next_visit_memo: スタジアム忘備録 (stadium 時のみ意味を持つ)
  let nextVisitMemo = null
  if (watchType === 'stadium' && body.next_visit_memo != null) {
    const m = String(body.next_visit_memo).trim()
    if (m.length > 0) {
      if ([...m].length > NEXT_VISIT_MEMO_MAX) {
        return Response.json({ error: `スタジアム忘備録は${NEXT_VISIT_MEMO_MAX}文字以内` }, { status: 400 })
      }
      if (containsNG(m)) {
        return Response.json({ error: 'スタジアム忘備録に使用できない言葉が含まれています' }, { status: 400 })
      }
      nextVisitMemo = m
    }
  }

  // timeline: その日 1 日の行動メモ [{time:'HH:mm', text:'...'}]
  const timeline = []
  if (body.timeline != null) {
    if (!Array.isArray(body.timeline)) {
      return Response.json({ error: 'タイムラインの形式が不正です' }, { status: 400 })
    }
    if (body.timeline.length > TIMELINE_MAX_ENTRIES) {
      return Response.json({ error: `タイムラインは${TIMELINE_MAX_ENTRIES}件以内` }, { status: 400 })
    }
    for (const raw of body.timeline) {
      if (raw == null || typeof raw !== 'object') continue
      const time = String(raw.time ?? '').trim()
      const text = String(raw.text ?? '').trim()
      if (!time && !text) continue
      if (!TIME_HHMM_RE.test(time)) {
        return Response.json({ error: 'タイムラインの時刻は HH:mm 形式で入力してください' }, { status: 400 })
      }
      if (text.length === 0) {
        return Response.json({ error: 'タイムラインのテキストを入力してください' }, { status: 400 })
      }
      if ([...text].length > TIMELINE_TEXT_MAX) {
        return Response.json({ error: `タイムラインのテキストは${TIMELINE_TEXT_MAX}文字以内` }, { status: 400 })
      }
      if (containsNG(text)) {
        return Response.json({ error: 'タイムラインに使用できない言葉が含まれています' }, { status: 400 })
      }
      timeline.push({ time, text })
    }
    timeline.sort((a, b) => a.time.localeCompare(b.time))
  }

  // fixture が存在するか確認
  const fx = await sql`SELECT id FROM fixtures WHERE id = ${fixtureId}`
  if (fx.length === 0) {
    return Response.json({ error: '試合が見つかりません' }, { status: 404 })
  }

  await sql`
    INSERT INTO watch_notes (
      clerk_user_id, fixture_id, watch_type, match_impression, next_visit_memo, timeline,
      created_at, updated_at
    ) VALUES (
      ${userId}, ${fixtureId}, ${watchType}, ${matchImpression}, ${nextVisitMemo},
      ${JSON.stringify(timeline)}::jsonb, NOW(), NOW()
    )
    ON CONFLICT (clerk_user_id, fixture_id) DO UPDATE SET
      watch_type       = EXCLUDED.watch_type,
      match_impression = EXCLUDED.match_impression,
      next_visit_memo  = EXCLUDED.next_visit_memo,
      timeline         = EXCLUDED.timeline,
      updated_at       = NOW()
  `
  return Response.json({ ok: true })
}

// DELETE /api/watch-notes?fixture_id=...
export async function DELETE(request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const fixtureId = Number(searchParams.get('fixture_id'))
  if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
    return Response.json({ error: 'fixture_id が不正です' }, { status: 400 })
  }

  await sql`
    DELETE FROM watch_notes
    WHERE clerk_user_id = ${userId} AND fixture_id = ${fixtureId}
  `
  return Response.json({ ok: true })
}
