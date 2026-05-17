// J.League Data Site フルスクレイパー (CLI)
//
// 実体は lib/jleague-scraper-full.js (API ルート /api/sync/jleague-official とロジック共有)
//
// 使い方:
//   node scripts/scrape-jleague-full.mjs --match 32925                    (1試合テスト、dry-run)
//   node scripts/scrape-jleague-full.mjs --match 32925 --apply            (1試合DB書き込み)
//   node scripts/scrape-jleague-full.mjs --season 2025 --league 98        (2025 J1 全試合, dry-run 先頭5件)
//   node scripts/scrape-jleague-full.mjs --season 2025 --league 98 --all --apply  (本番実行)
//
// フラグ:
//   --match <id>       単一試合モード
//   --season <y>       シーズン (default: 2025)
//   --league <id>      J.League competition_frame_ids (98=J1 に相当する内部ID, default: 1 (J1))
//   --limit <n>        処理上限 (default: 5)
//   --all              上限解除
//   --apply            DB書き込み有効
//   --delay-min <ms>   リクエスト間隔最小 (default: 2000)
//   --delay-max <ms>   リクエスト間隔最大 (default: 5000)

import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'

// lib import より前に env をロード (lib/db.js が process.env.DATABASE_URL を即座に評価するため)
config({ path: '.env.local' })

const {
  prepareMatch,
  prepareFutureMatch,
  commitMatch,
  fetchMatchListForSeason,
  loadTeamNameMap,
  resolveTeamId,
  parseListDate,
  sleep,
} = await import('../lib/jleague-scraper-full.js')

const sql = neon(process.env.DATABASE_URL)

// ─── CLI 引数 ────────────────────────────────────
const args = process.argv.slice(2)
const getArg = (k, d) => { const i = args.indexOf(k); return i === -1 ? d : args[i + 1] }
const hasFlag = k => args.includes(k)

const matchOnly    = getArg('--match', null)
const season       = Number(getArg('--season', 2025))
const leagueArg    = getArg('--league', null)
// 直接パラメータ指定（2026特別リーグなど、--season では足りないケース用）
// 例: --comp-years 20261 --comp-frame 35 で 2026 J1特別リーグ
const compYears    = getArg('--comp-years', String(season))
const compFrameId  = getArg('--comp-frame', leagueArg ?? '1')

// comp-frame から league_id を自動推定 (DB上のleague_id用、--league で明示指定可)
//   frame 35 = J1百年構想 → league_id 98
//   frame 36 = J2J3百年構想 → league_id 2
//   frame 1/2/3 = 通常J1/J2/J3 → そのまま
const FRAME_TO_LEAGUE_ID = { '35': 98, '36': 2, '1': 1, '2': 2, '3': 3, '11': 100, '30': 100 }
const leagueId     = leagueArg
  ? Number(leagueArg)
  : (FRAME_TO_LEAGUE_ID[String(compFrameId)] ?? Number(compFrameId))
const limit        = hasFlag('--all') ? Infinity : Number(getArg('--limit', 5))
const apply        = hasFlag('--apply')
const pastOnly     = hasFlag('--past-only')          // 完了試合のみ（未来スキップ）
const skipDone     = hasFlag('--skip-done')          // data_source='j-league' の試合を再処理しない
const broadcastOnly = hasFlag('--broadcast-only')    // 放送情報(broadcast_ja)のみ一覧から一括UPDATE
const roundsOnly   = hasFlag('--rounds-only')        // round / round_number のみ一覧から一括UPDATE
const recentN      = getArg('--recent', null)        // リスト末尾から最新N試合だけ対象（定期実行用）
const delayMinMs   = Number(getArg('--delay-min', 2000))
const delayMaxMs   = Number(getArg('--delay-max', 5000))

function randDelay() { return delayMinMs + Math.random() * (delayMaxMs - delayMinMs) }

// ─── Main ───────────────────────────────────────
console.log('\n=== J.League Full Scraper ===')
console.log(`mode: ${apply ? 'APPLY' : 'DRY-RUN'}, delay ${delayMinMs}〜${delayMaxMs}ms`)

try {
  if (matchOnly) {
    console.log(`Single match: match_card_id=${matchOnly}`)
    const prep = await prepareMatch(Number(matchOnly), { apply, league: leagueId, skipDone })
    if (prep.skipped) {
      console.log(`[match=${prep.matchCardId}] skip (already j-league)`)
    } else {
      for (const line of prep.logLines) console.log(line)
      if (prep.dryRun) {
        console.log('  (dry-run, DB未書き込み)')
      } else {
        await commitMatch(prep)
        console.log(`  ✓ DB書き込み完了 (${prep.queries.length} queries in 1 txn, new players=${prep.newPlayerCount})`)
      }
    }
  } else if (broadcastOnly) {
    // 一覧ページから放送情報だけ一括UPDATE（個別試合ページは取得しない）
    console.log(`Broadcast-only mode: comp_years=${compYears} comp_frame=${compFrameId}`)
    const rows = await fetchMatchListForSeason(compYears, compFrameId)
    console.log(`[list] ${rows.length} matches`)
    if (!apply) {
      const sample = rows.slice(0, 10).map(r => `${r.matchCardId} ${r.date} ${r.home} vs ${r.away} → ${r.broadcast ?? '(none)'}`).join('\n  ')
      console.log(`(dry-run) 先頭10件:\n  ${sample}`)
    } else {
      const queries = []
      let skipped = 0
      for (const r of rows) {
        if (!r.broadcast) { skipped++; continue }
        queries.push(sql`
          UPDATE fixtures SET broadcast_ja = ${r.broadcast}, updated_at = NOW()
          WHERE id = ${r.matchCardId}
        `)
      }
      // 1 トランザクションで全件UPDATE
      await sql.transaction(queries)
      // 実際に何件 DB に反映されたか件数カウント
      const c = await sql`
        SELECT COUNT(*)::int AS n FROM fixtures WHERE id = ANY(${rows.filter(r => r.broadcast).map(r => r.matchCardId)}) AND broadcast_ja IS NOT NULL
      `
      console.log(`\n=== 放送情報 UPDATE 完了: attempted=${queries.length} now_with_broadcast=${c[0].n} skipped_empty=${skipped} ===`)
      console.log(`  (attempted と now_with_broadcast の差は、DB に該当 fixture が無い試合)`)
    }
  } else if (roundsOnly) {
    // 一覧ページから round / round_number のみ一括UPDATE
    console.log(`Rounds-only mode: comp_years=${compYears} comp_frame=${compFrameId}`)
    const rows = await fetchMatchListForSeason(compYears, compFrameId)
    console.log(`[list] ${rows.length} matches`)
    if (!apply) {
      const sample = rows.slice(0, 10).map(r => `${r.matchCardId} ${r.date} ${r.home} vs ${r.away} → round="${r.round ?? '(none)'}" round_number=${r.roundNumber ?? 'null'}`).join('\n  ')
      console.log(`(dry-run) 先頭10件:\n  ${sample}`)
    } else {
      const queries = []
      let skipped = 0
      for (const r of rows) {
        if (!r.round) { skipped++; continue }
        // 既存値（API-FOOTBALL 由来等）を尊重する場合は COALESCE。
        // 本モードは「J.League表記で埋めたい」なので常に上書き。
        queries.push(sql`
          UPDATE fixtures SET round = ${r.round}, round_number = ${r.roundNumber ?? null}, stage_ja = ${r.stageJa ?? null}, updated_at = NOW()
          WHERE id = ${r.matchCardId}
        `)
      }
      await sql.transaction(queries)
      const ids = rows.filter(r => r.round).map(r => r.matchCardId)
      const c = await sql`
        SELECT COUNT(*)::int AS n FROM fixtures WHERE id = ANY(${ids}) AND round IS NOT NULL
      `
      console.log(`\n=== 節情報 UPDATE 完了: attempted=${queries.length} now_with_round=${c[0].n} skipped_empty=${skipped} ===`)
    }
  } else {
    console.log(`Batch mode: comp_years=${compYears} comp_frame=${compFrameId} limit=${limit === Infinity ? 'all' : limit} past-only=${pastOnly}`)
    const rows = await fetchMatchListForSeason(compYears, compFrameId)
    const completed = rows.filter(r => r.isCompleted).length
    const upcoming  = rows.length - completed
    console.log(`[list] ${rows.length} matches (完了:${completed} / 未完了:${upcoming})`)

    let filtered = pastOnly ? rows.filter(r => r.isCompleted) : rows

    // --recent N: 日付降順ソートして最新 N 件に絞る（定期実行用）
    if (recentN != null) {
      const n = Number(recentN)
      filtered = [...filtered].sort((a, b) => parseListDate(b.date) - parseListDate(a.date)).slice(0, n)
      console.log(`[list] --recent ${n}: 最新${filtered.length}試合に絞り込み`)
    }

    // --skip-done: 一括チェックで既処理分を除外
    //   (A) id = match_card_id の直接一致 (2017-2025 新規INSERT由来)
    //   (B) date + home_team + away_team の一致 (2026特別など既存API-FOOTBALL fixtureをUPDATEした場合)
    //   未開催試合 (status='NS') は 'j-league' でも完了後に再処理が必要なのでスキップ対象外
    if (skipDone && filtered.length > 0) {
      const teamMap = await loadTeamNameMap()
      const listDateToYmd = s => {
        const m = /^(\d{2})\/(\d{2})\/(\d{2})/.exec(s ?? '')
        return m ? `20${m[1]}-${m[2]}-${m[3]}` : null
      }
      const ids = filtered.map(r => r.matchCardId).filter(v => v != null)  // 未開催 (matchCardId=null) は除外
      const dates = [...new Set(filtered.map(r => listDateToYmd(r.date)).filter(Boolean))]
      const [byId, byDate] = await Promise.all([
        sql`SELECT id FROM fixtures WHERE id = ANY(${ids}) AND data_source = 'j-league' AND status IN ('FT','AET','PEN')`,
        dates.length > 0
          ? sql`SELECT TO_CHAR(date AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS d_jst, home_team_id, away_team_id FROM fixtures WHERE TO_CHAR(date AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') = ANY(${dates}) AND data_source = 'j-league' AND status IN ('FT','AET','PEN')`
          : Promise.resolve([])
      ])
      const doneIds = new Set(byId.map(r => r.id))
      const doneDTA = new Set(byDate.map(r => `${r.d_jst}:${r.home_team_id}:${r.away_team_id}`))
      const before = filtered.length
      filtered = filtered.filter(r => {
        if (r.matchCardId != null && doneIds.has(r.matchCardId)) return false
        const ymd = listDateToYmd(r.date)
        const hId = resolveTeamId(r.home, teamMap)
        const aId = resolveTeamId(r.away, teamMap)
        if (!ymd || !hId || !aId) return true  // 解決できない場合は通常処理へ
        return !doneDTA.has(`${ymd}:${hId}:${aId}`)
      })
      console.log(`[list] skip-done 一括チェック: ${before} → ${filtered.length} (${before - filtered.length}件スキップ)`)
    }
    console.log(`[list] 処理対象: ${filtered.length} 試合\n`)

    const targets = filtered.slice(0, limit)
    const stats = { ok: 0, err: 0, skipped: 0 }

    // パイプライン用状態
    //   - prevCommit: 直前試合のコミット Promise（裏で走らせ、次の試合の fetch と重ねる）
    //   - lastFetchStartAt: 直近の fetch 開始時刻。次の fetch はこれ + randDelay() まで待つ。
    //     これによりJ.Leagueへのリクエスト間隔は従来通り維持される。
    let prevCommit = null
    let prevMatchId = null
    let lastFetchStartAt = 0

    async function awaitPrevCommit() {
      if (!prevCommit) return
      const pending = prevCommit
      const pendingId = prevMatchId
      prevCommit = null
      prevMatchId = null
      try {
        await pending
        stats.ok++
        console.log(`  ✓ commit ok (match=${pendingId})`)
      } catch (err) {
        console.error(`  ✗ commit failed (match=${pendingId}): ${err.message}`)
        stats.err++
      }
    }

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i]
      try {
        // 未開催試合 (matchCardId なし) は詳細ページfetchせず、リスト行データだけで処理
        const isFuture = target.matchCardId == null

        if (!isFuture) {
          // J.League へのリクエスト間隔を維持（fetch 開始時刻ベース）
          if (lastFetchStartAt > 0) {
            const wait = lastFetchStartAt + randDelay() - Date.now()
            if (wait > 0) await sleep(wait)
          }
          lastFetchStartAt = Date.now()
        }

        // fetch + parse + 選手プリロード（前試合のDBコミットと並行）
        //   バッチモードでは既に一括 skip-done 済みなので prepareMatch 側の個別 SELECT は無効化
        const prep = isFuture
          ? await prepareFutureMatch(target, { apply, league: leagueId })
          : await prepareMatch(target.matchCardId, {
              apply, league: leagueId, skipDone: false,
              broadcast: target.broadcast,
              isCompleted: target.isCompleted ?? true,
            })

        if (prep.skipped) {
          console.log(`[match=${prep.matchCardId}] skip (already j-league)`)
          stats.skipped++
          // skipは fetch しないので間隔タイマーはリセット
          lastFetchStartAt = 0
          continue
        }
        for (const line of prep.logLines) console.log(line)

        // 次のコミットを投げる前に、前のコミットの完了を待つ
        await awaitPrevCommit()

        if (prep.dryRun) {
          console.log('  (dry-run, DB未書き込み)')
          stats.ok++
        } else {
          // 裏でコミット開始、戻らず次ループへ（次の fetch と並走）
          prevCommit = commitMatch(prep)
          prevMatchId = prep.matchCardId
        }
      } catch (err) {
        console.error(`  ✗ match=${target.matchCardId} error: ${err.message}`)
        stats.err++
      }
    }
    // 最後のコミットを待機
    await awaitPrevCommit()

    console.log(`\n=== 終了 ok=${stats.ok} skipped=${stats.skipped} err=${stats.err} ===`)
  }
} catch (err) {
  console.error('Fatal:', err)
  process.exit(1)
}
