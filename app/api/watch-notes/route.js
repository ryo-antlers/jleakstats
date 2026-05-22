import { auth } from '@clerk/nextjs/server'
import sql from '@/lib/db'
import { containsNG } from '@/lib/ng-words'
import { isValidPrefecture } from '@/lib/jp/prefectures'
import { isValidMunicipality } from '@/lib/jp/municipalities'

const WATCH_TYPES = ['stadium', 'dazn', 'tv', 'no_watch']
const ACCESS_TYPES = ['train', 'car', 'bus', 'walk', 'other']
const SEAT_TYPES = ['goal_back', 'reserved']
const COMPANION_MAX = 50
const NEXT_VISIT_MEMO_MAX = 500
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
      SELECT id, fixture_id, watch_type, access, seat_type, companion, next_visit_memo,
             departure_prefecture, departure_city, timeline, created_at, updated_at
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
      SELECT wn.id, wn.fixture_id, wn.watch_type, wn.access, wn.seat_type, wn.companion, wn.next_visit_memo,
             wn.departure_prefecture, wn.departure_city, wn.timeline, wn.created_at, wn.updated_at,
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
//   body: { fixture_id, watch_type, access?, companion?, next_visit_memo?, departure_prefecture?, departure_city? }
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

  // access は stadium の時のみ意味を持つ。他の場合は強制的に NULL に
  let access = null
  if (watchType === 'stadium' && body.access != null && body.access !== '') {
    const a = String(body.access)
    if (!ACCESS_TYPES.includes(a)) {
      return Response.json({ error: 'アクセス手段が不正です' }, { status: 400 })
    }
    access = a
  }

  // seat_type も stadium のときのみ意味を持つ (ゴール裏 / 指定席)
  let seatType = null
  if (watchType === 'stadium' && body.seat_type != null && body.seat_type !== '') {
    const s = String(body.seat_type)
    if (!SEAT_TYPES.includes(s)) {
      return Response.json({ error: '座席タイプが不正です' }, { status: 400 })
    }
    seatType = s
  }

  // companion: 50字、NG ワード弾く
  let companion = null
  if (body.companion != null) {
    const c = String(body.companion).trim()
    if (c.length > 0) {
      if ([...c].length > COMPANION_MAX) {
        return Response.json({ error: `同行者は${COMPANION_MAX}文字以内` }, { status: 400 })
      }
      if (containsNG(c)) {
        return Response.json({ error: '同行者に使用できない言葉が含まれています' }, { status: 400 })
      }
      companion = c
    }
  }

  // next_visit_memo: 500字、NG ワード弾く
  //   「次回観戦時の備忘メモ」(自分が次に観戦する時のためのヒント)
  let nextVisitMemo = null
  if (body.next_visit_memo != null) {
    const m = String(body.next_visit_memo).trim()
    if (m.length > 0) {
      if ([...m].length > NEXT_VISIT_MEMO_MAX) {
        return Response.json({ error: `次回観戦時の備忘メモは${NEXT_VISIT_MEMO_MAX}文字以内` }, { status: 400 })
      }
      if (containsNG(m)) {
        return Response.json({ error: '次回観戦時の備忘メモに使用できない言葉が含まれています' }, { status: 400 })
      }
      nextVisitMemo = m
    }
  }

  // 出発地 (departure_prefecture / departure_city)
  //   - stadium のときのみ意味を持つ (他の場合は強制的に NULL)
  //   - prefecture は固定マスタ、city は prefecture とセットで municipalities マスタ
  //   - 移動距離計算 (lib/notes/distance.js) で使う
  let departurePrefecture = null
  let departureCity = null
  if (watchType === 'stadium') {
    const prefRaw = body.departure_prefecture == null ? null : String(body.departure_prefecture).trim()
    const cityRaw = body.departure_city == null ? null : String(body.departure_city).trim()
    if (prefRaw && prefRaw.length > 0) {
      if (!isValidPrefecture(prefRaw)) {
        return Response.json({ error: '出発地の都道府県が不正です' }, { status: 400 })
      }
      departurePrefecture = prefRaw
      if (cityRaw && cityRaw.length > 0) {
        if (!isValidMunicipality(prefRaw, cityRaw)) {
          return Response.json({ error: '出発地の市区町村が不正です' }, { status: 400 })
        }
        departureCity = cityRaw
      }
    }
  }

  // timeline: その日 1 日の行動メモ [{time:'HH:mm', text:'...'}]
  //   - 空エントリ (time も text も空) は無視
  //   - text は 100 字以内 / NG ワードチェック
  //   - 保存時に時刻昇順にソート
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
      clerk_user_id, fixture_id, watch_type, access, seat_type, companion, next_visit_memo,
      departure_prefecture, departure_city, timeline, created_at, updated_at
    ) VALUES (
      ${userId}, ${fixtureId}, ${watchType}, ${access}, ${seatType}, ${companion}, ${nextVisitMemo},
      ${departurePrefecture}, ${departureCity}, ${JSON.stringify(timeline)}::jsonb, NOW(), NOW()
    )
    ON CONFLICT (clerk_user_id, fixture_id) DO UPDATE SET
      watch_type           = EXCLUDED.watch_type,
      access               = EXCLUDED.access,
      seat_type            = EXCLUDED.seat_type,
      companion            = EXCLUDED.companion,
      next_visit_memo      = EXCLUDED.next_visit_memo,
      departure_prefecture = EXCLUDED.departure_prefecture,
      departure_city       = EXCLUDED.departure_city,
      timeline             = EXCLUDED.timeline,
      updated_at           = NOW()
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
