import sql from '@/lib/db'
import { COMP_YEARS } from '@/lib/season'
import {
  fetchMatchListForSeason,
  prepareMatch,
  commitMatch,
  clearCaches,
  loadTeamNameMap,
  resolveTeamId,
  parseListDate,
} from '@/lib/jleague-scraper-full'

// J.League 公式記録 (試合詳細) 取込 API
//
// scripts/scrape-jleague-full.mjs と同じロジックを共有 (lib/jleague-scraper-full.js)
// 試合終了から 15分以上経過した試合を対象に J.League 公式の試合詳細ページを fetch して取り込む。
//
// 想定 cron: cron-job.org から 5分間隔で `?league=j1` と `?league=j2j3` の2つを叩く
//   (GitHub Actions cron は実遅延 1〜3h あるため公式記録反映が遅れていた、その解消用)
//
// Vercel Hobby (maxDuration 10s) 内に収めるため:
//   - 1リクエスト 1リーグのみ
//   - 1リクエスト 1試合のみ取込 (limit クエリで増減可)
//   - 一覧 fetch (~2秒) + 詳細 fetch (~3秒) + DB writes ≒ 6〜8 秒
//
// 設計詳細:
//   - 一覧から完了試合 (スコアあり + キックオフから 2h10min 経過) の matchCardId (5桁) を取得
//     ※ 一覧の "スコアあり" だけだと試合中の途中スコア (1-0 等) や終了直後の不完全データを
//        掴むリスクがあるため、時刻バッファを入れて公式の入力完了を待つ
//   - DB の data_source='j-league' を見て未取込分を抽出 (id 一致 or date+home+away 一致)
//   - 最古の未取込試合から limit 件処理 (古い順に消化していく前提)
//   - 取り込み成功した試合は data_source='j-league' になり次回 skip-done で除外される

export const maxDuration = 10  // Vercel Hobby

const LEAGUE_MAP = {
  j1:   { compYears: COMP_YEARS, compFrame: '35', leagueId: 98 },
  j2j3: { compYears: COMP_YEARS, compFrame: '36', leagueId: 2  },
}

function listDateToYmd(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})/.exec(s ?? '')
  return m ? `20${m[1]}-${m[2]}-${m[3]}` : null
}

// 一覧の date (例 "26/05/24") + kickoff (例 "14:00") → JST キックオフ時刻の epoch ms
// J.League 公式の試合一覧は時刻が JST 表記なので Date.UTC で -9h 補正してUTCに直す
function listKickoffMs(dateStr, koStr) {
  const dm = /^(\d{2})\/(\d{2})\/(\d{2})/.exec(dateStr ?? '')
  const tm = /^(\d{1,2}):(\d{2})/.exec(koStr ?? '')
  if (!dm || !tm) return null
  const yyyy = 2000 + parseInt(dm[1], 10)
  const mm   = parseInt(dm[2], 10) - 1
  const dd   = parseInt(dm[3], 10)
  const hh   = parseInt(tm[1], 10)
  const mi   = parseInt(tm[2], 10)
  return Date.UTC(yyyy, mm, dd, hh - 9, mi, 0)
}

// 試合終了から 15分経過したとみなす猶予時間
// 試合90分 + HT15分 + ロスタイム10分前後 + 15分マージン = キックオフから 2h10min 後
// 延長/PK の場合はもう少しかかるが、その場合は次の cron tick (5分後) で再判定すれば良い
const FINISH_BUFFER_MS = (2 * 60 + 10) * 60 * 1000

export async function GET(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const leagueParam = url.searchParams.get('league') || 'j1'
  const limit = Math.max(1, Math.min(3, Number(url.searchParams.get('limit') || 1)))

  const cfg = LEAGUE_MAP[leagueParam]
  if (!cfg) {
    return Response.json({ error: `invalid league: ${leagueParam}` }, { status: 400 })
  }

  // Vercel Functions の warm start で stale キャッシュを使わないようにリセット
  clearCaches()

  try {
    // 1. 一覧取得 → 完了試合のみ
    //    一覧の "スコアあり" だけだと試合中・終了直後の不完全データを掴むリスクがあるため
    //    "キックオフから 2h10min 経過" も条件にして、公式記録の入力完了 (試合終了から15分後) を待つ
    const rows = await fetchMatchListForSeason(cfg.compYears, cfg.compFrame)
    const now = Date.now()
    const completed = rows.filter(r => {
      if (!r.isCompleted || r.matchCardId == null) return false
      const koMs = listKickoffMs(r.date, r.kickoff)
      if (koMs == null) return true  // パース失敗時は安全側 (取り込み試行)
      return now - koMs >= FINISH_BUFFER_MS
    })

    if (completed.length === 0) {
      return Response.json({ ok: true, league: leagueParam, processed: 0, message: 'no completed matches' })
    }

    // 2. skip-done: DB から取込済の試合を取得して除外
    //    (A) id = match_card_id 一致 / (B) date + home + away 一致
    const teamMap = await loadTeamNameMap()
    const ids   = completed.map(r => r.matchCardId)
    const dates = [...new Set(completed.map(r => listDateToYmd(r.date)).filter(Boolean))]
    const [byId, byDate] = await Promise.all([
      sql`SELECT id FROM fixtures WHERE id = ANY(${ids}) AND data_source = 'j-league' AND status IN ('FT','AET','PEN')`,
      dates.length > 0
        ? sql`SELECT TO_CHAR(date AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS d_jst, home_team_id, away_team_id FROM fixtures WHERE TO_CHAR(date AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') = ANY(${dates}) AND data_source = 'j-league' AND status IN ('FT','AET','PEN')`
        : Promise.resolve([]),
    ])
    const doneIds = new Set(byId.map(r => r.id))
    const doneDTA = new Set(byDate.map(r => `${r.d_jst}:${r.home_team_id}:${r.away_team_id}`))

    const todo = completed.filter(r => {
      if (doneIds.has(r.matchCardId)) return false
      const ymd = listDateToYmd(r.date)
      const hId = resolveTeamId(r.home, teamMap)
      const aId = resolveTeamId(r.away, teamMap)
      if (!ymd || !hId || !aId) return true
      return !doneDTA.has(`${ymd}:${hId}:${aId}`)
    })

    if (todo.length === 0) {
      return Response.json({
        ok: true, league: leagueParam, processed: 0,
        total_completed: completed.length, message: 'all up to date',
      })
    }

    // 3. 古い順 (キックオフ早い) で limit 件処理
    const targets = [...todo].sort((a, b) => parseListDate(a.date) - parseListDate(b.date)).slice(0, limit)

    const results = []
    for (const target of targets) {
      try {
        const prep = await prepareMatch(target.matchCardId, {
          apply: true,
          league: cfg.leagueId,
          skipDone: false,  // 既に skip-done 適用済
          broadcast: target.broadcast,
          isCompleted: true,
        })
        if (prep.skipped) {
          results.push({ matchCardId: target.matchCardId, skipped: true })
          continue
        }
        await commitMatch(prep)
        results.push({
          matchCardId: target.matchCardId,
          fixtureId: prep.fixtureId,
          newPlayers: prep.newPlayerCount,
          queries: prep.queries.length,
        })
      } catch (err) {
        results.push({ matchCardId: target.matchCardId, error: err.message })
      }
    }

    return Response.json({
      ok: true,
      league: leagueParam,
      processed: results.length,
      pending: todo.length - results.length,
      total_completed: completed.length,
      results,
    })
  } catch (err) {
    console.error(err)
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
