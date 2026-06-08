import sql from '@/lib/db'
import { SEASON } from '@/lib/season'
import {
  dbLeagueToJleaguePath,
  fetchRoundListing,
  fetchAjaxLiveHtml,
  parseRefereesFromHtml,
  matchListingToFixtures,
} from '@/lib/jleague-scraper'

// 試合前の審判情報を J.League 公式 (jleague.jp) から取得して fixtures.referee_ja に保存
//
// 動作:
//   1. キックオフ -2h10min 〜 -1h の試合 (status=NS, referee_ja IS NULL) を DB から取得
//      - 審判発表は 試合2時間前 が定例 → -2h10min から張り込み
//      - -1h まで取れなければ諦め (試合後は公式記録 referee_ja_official で上書き表示)
//   2. 該当ありなら リーグ別に節別TOP一覧を1回 fetch して match_code マップ作成
//   3. 各試合の ajax_live.json を fetch、主審が入っていれば referee_ja に保存
//   4. 主審がまだ空なら skip (次の cron tick で再試行)
//
// 想定 cron: 5分おき (cron-job.org)
// J.League 側への負荷:
//   - 試合のない日: DB クエリ1発で 0 件 → 何も fetch しない
//   - 試合のある日: 該当試合数 × (節別TOP 1回 + ajax_live 数回/試合) 程度
//
// 念のため fetch 間に 200ms スリープを入れて並列突撃しない

const SLEEP_MS = 200

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

export async function GET(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. 対象試合を DB から取得
    //    キックオフ前 -2h10min 〜 -1h の窓
    //    審判発表は 試合2時間前 が定例。-2h10min は 5分間隔 cron で 1〜2 tick の余裕を取る形
    //    -1h まで取れなければ諦め (試合後は公式記録 referee_ja_official で上書き表示される)
    const targets = await sql`
      SELECT
        f.id, f.league_id, f.date,
        th.short_name AS home_short,
        ta.short_name AS away_short,
        th.name_ja    AS home_ja,
        ta.name_ja    AS away_ja
      FROM fixtures f
      LEFT JOIN teams_master th ON th.id = f.home_team_id
      LEFT JOIN teams_master ta ON ta.id = f.away_team_id
      WHERE f.season = ${SEASON}
        AND f.status = 'NS'
        AND f.referee_ja IS NULL
        AND f.date BETWEEN NOW() + INTERVAL '1 hour'
                       AND NOW() + INTERVAL '2 hours 10 minutes'
        AND f.league_id IN (98, 2)
    `

    if (targets.length === 0) {
      return Response.json({ ok: true, checked: 0, updated: 0, skipped: 0, by_league: {} })
    }

    // 2. リーグ別グループ化
    const byLeague = new Map()
    for (const t of targets) {
      if (!byLeague.has(t.league_id)) byLeague.set(t.league_id, [])
      byLeague.get(t.league_id).push(t)
    }

    let checked = 0
    let updated = 0
    let skipped = 0
    const errors = []
    const byLeagueResult = {}

    for (const [dbLeague, fixtures] of byLeague) {
      const jpath = dbLeagueToJleaguePath(dbLeague)

      // 節別TOPから match_code 一覧
      let listing
      try {
        listing = await fetchRoundListing(jpath)
      } catch (err) {
        errors.push({ league: dbLeague, stage: 'listing', error: err.message })
        continue
      }
      await sleep(SLEEP_MS)

      // (home_short, away_short, date) で match_code マッピング
      const codeMap = matchListingToFixtures(
        listing,
        fixtures.map(f => ({
          fixture_id: f.id,
          home_short: f.home_short,
          away_short: f.away_short,
          date: f.date,
        }))
      )

      const leagueStats = { fixtures: fixtures.length, mapped: codeMap.size, updated: 0, skipped: 0 }

      // 各試合の ajax_live.json を fetch
      for (const f of fixtures) {
        const code = codeMap.get(f.id)
        if (!code) {
          skipped++
          leagueStats.skipped++
          errors.push({
            fixture_id: f.id,
            stage: 'mapping',
            error: `match_code not found for ${f.home_ja} vs ${f.away_ja}`,
          })
          continue
        }

        let html
        try {
          html = await fetchAjaxLiveHtml(jpath, code)
        } catch (err) {
          errors.push({ fixture_id: f.id, stage: 'fetch', error: err.message })
          await sleep(SLEEP_MS)
          continue
        }
        checked++

        const refs = parseRefereesFromHtml(html)
        if (!refs.main) {
          // まだ主審未発表
          skipped++
          leagueStats.skipped++
          await sleep(SLEEP_MS)
          continue
        }

        // 副審・第4・VAR・AVAR は補助情報として存在すれば referee_ja に集約
        // (referee_ja は単一 text 列なので主審名のみ保存するのが基本)
        try {
          await sql`
            UPDATE fixtures
            SET referee_ja = ${refs.main},
                updated_at = NOW()
            WHERE id = ${f.id}
          `
          updated++
          leagueStats.updated++
        } catch (err) {
          errors.push({ fixture_id: f.id, stage: 'update', error: err.message })
        }
        await sleep(SLEEP_MS)
      }

      byLeagueResult[dbLeague] = leagueStats
    }

    return Response.json({
      ok: true,
      checked,
      updated,
      skipped,
      by_league: byLeagueResult,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error(err)
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
