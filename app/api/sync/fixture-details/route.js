import sql from '@/lib/db'
import {
  fetchFixtureStatistics,
  fetchFixtureEvents,
  fetchFixtureLineups,
  fetchFixturePlayers,
  fetchOdds,
} from '@/lib/api-football'

// 試合後データ（スタッツ・イベント・ラインナップ・選手評価・オッズ）を同期
// スタッツが未取得の試合のみ対象（リクエスト数節約）
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const fixtureId = searchParams.get('fixture_id')
  if (!fixtureId && request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    let fixtures
    if (fixtureId) {
      fixtures = await sql`
        SELECT id FROM fixtures WHERE id = ${parseInt(fixtureId)}
      `
    } else {
      // スタッツ未取得の試合終了済み試合を取得（最大10件ずつ）
      fixtures = await sql`
        SELECT f.id FROM fixtures f
        LEFT JOIN fixture_statistics fs ON f.id = fs.fixture_id
        WHERE f.status IN ('FT', 'AET', 'PEN')
          AND f.season = 2026
          AND fs.fixture_id IS NULL
        ORDER BY f.date DESC
        LIMIT 10
      `
    }

    if (fixtures.length === 0) {
      return Response.json({ ok: true, message: '未取得の試合なし', processed: 0 })
    }

    let processed = 0
    const errors = []

    for (const { id } of fixtures) {
      try {
        // 並行取得（リクエスト数: 5/試合）
        const [statsRes, eventsRes, lineupsRes, playersRes, oddsRes] = await Promise.all([
          fetchFixtureStatistics(id).catch(() => []),
          fetchFixtureEvents(id).catch(() => []),
          fetchFixtureLineups(id).catch(() => []),
          fetchFixturePlayers(id).catch(() => []),
          fetchOdds(id).catch(() => []),
        ])

        // --- スタッツ保存 ---
        for (const teamData of statsRes) {
          const teamId = teamData.team.id
          const s = {}
          for (const stat of teamData.statistics) {
            switch (stat.type) {
              case 'Shots on Goal':      s.shots_on = stat.value ?? 0; break
              case 'Shots off Goal':     s.shots_off = stat.value ?? 0; break
              case 'Total Shots':        s.shots_total = stat.value ?? 0; break
              case 'Blocked Shots':      s.shots_blocked = stat.value ?? 0; break
              case 'Shots insidebox':    s.shots_inside = stat.value ?? 0; break
              case 'Shots outsidebox':   s.shots_outside = stat.value ?? 0; break
              case 'Fouls':              s.fouls = stat.value ?? 0; break
              case 'Corner Kicks':       s.corners = stat.value ?? 0; break
              case 'Offsides':           s.offsides = stat.value ?? 0; break
              case 'Ball Possession':    s.possession = stat.value ?? '0%'; break
              case 'Yellow Cards':       s.yellow_cards = stat.value ?? 0; break
              case 'Red Cards':          s.red_cards = stat.value ?? 0; break
              case 'Goalkeeper Saves':   s.saves = stat.value ?? 0; break
              case 'Total passes':       s.passes_total = stat.value ?? 0; break
              case 'Passes accurate':    s.passes_accurate = stat.value ?? 0; break
              case 'Passes %':           s.passes_pct = stat.value ?? '0%'; break
              case 'expected_goals':     s.expected_goals = stat.value ? parseFloat(stat.value) : null; break
            }
          }
          await sql`
            INSERT INTO fixture_statistics (
              fixture_id, team_id,
              shots_on, shots_off, shots_total, shots_blocked, shots_inside, shots_outside,
              fouls, corners, offsides, possession,
              yellow_cards, red_cards, saves,
              passes_total, passes_accurate, passes_pct, expected_goals
            ) VALUES (
              ${id}, ${teamId},
              ${s.shots_on ?? 0}, ${s.shots_off ?? 0}, ${s.shots_total ?? 0},
              ${s.shots_blocked ?? 0}, ${s.shots_inside ?? 0}, ${s.shots_outside ?? 0},
              ${s.fouls ?? 0}, ${s.corners ?? 0}, ${s.offsides ?? 0}, ${s.possession ?? '0%'},
              ${s.yellow_cards ?? 0}, ${s.red_cards ?? 0}, ${s.saves ?? 0},
              ${s.passes_total ?? 0}, ${s.passes_accurate ?? 0}, ${s.passes_pct ?? '0%'},
              ${s.expected_goals ?? null}
            )
            ON CONFLICT (fixture_id, team_id) DO UPDATE SET
              shots_on = EXCLUDED.shots_on,
              shots_off = EXCLUDED.shots_off,
              shots_total = EXCLUDED.shots_total,
              fouls = EXCLUDED.fouls,
              corners = EXCLUDED.corners,
              possession = EXCLUDED.possession,
              yellow_cards = EXCLUDED.yellow_cards,
              red_cards = EXCLUDED.red_cards,
              saves = EXCLUDED.saves,
              passes_total = EXCLUDED.passes_total,
              passes_accurate = EXCLUDED.passes_accurate,
              passes_pct = EXCLUDED.passes_pct,
              expected_goals = EXCLUDED.expected_goals
          `
        }

        // --- イベント保存（既存削除して再投入）---
        if (eventsRes.length > 0) {
          await sql`DELETE FROM fixture_events WHERE fixture_id = ${id}`
          for (const ev of eventsRes) {
            await sql`
              INSERT INTO fixture_events (
                fixture_id, elapsed, team_id,
                player_id, player_name_en,
                assist_id, assist_name_en,
                type, detail
              ) VALUES (
                ${id}, ${ev.time.elapsed},
                ${ev.team.id},
                ${ev.player?.id ?? null}, ${ev.player?.name ?? null},
                ${ev.assist?.id ?? null}, ${ev.assist?.name ?? null},
                ${ev.type}, ${ev.detail}
              )
            `
          }
        }

        // --- ラインナップ保存 ---
        if (lineupsRes.length > 0) {
          await sql`DELETE FROM fixture_lineups WHERE fixture_id = ${id}`
          for (const teamData of lineupsRes) {
            const teamId = teamData.team.id
            const formation = teamData.formation
            const coachName = teamData.coach?.name ?? null
            for (const entry of teamData.startXI) {
              const p = entry.player
              await sql`
                INSERT INTO fixture_lineups (
                  fixture_id, team_id, coach_name, formation,
                  player_id, player_name_en, number, position, grid, is_starter
                ) VALUES (
                  ${id}, ${teamId}, ${coachName}, ${formation},
                  ${p.id}, ${p.name}, ${p.number}, ${p.pos}, ${p.grid}, true
                )
              `
            }
            for (const entry of teamData.substitutes) {
              const p = entry.player
              await sql`
                INSERT INTO fixture_lineups (
                  fixture_id, team_id, coach_name, formation,
                  player_id, player_name_en, number, position, grid, is_starter
                ) VALUES (
                  ${id}, ${teamId}, ${coachName}, ${formation},
                  ${p.id}, ${p.name}, ${p.number}, ${p.pos}, ${p.grid ?? null}, false
                )
              `
            }
          }
        }

        // --- 選手スタッツ保存 ---
        if (playersRes.length > 0) {
          for (const teamData of playersRes) {
            const teamId = teamData.team.id
            for (const entry of teamData.players) {
              const p = entry.player
              const g = entry.statistics[0]
              if (!g) continue
              await sql`
                INSERT INTO fixture_player_stats (
                  fixture_id, team_id, player_id,
                  minutes, number, position, rating,
                  is_captain, is_substitute,
                  shots_total, shots_on,
                  goals, assists, saves, conceded,
                  passes_total, passes_key, passes_accuracy,
                  tackles, blocks, interceptions,
                  duels_total, duels_won,
                  dribbles_attempts, dribbles_success,
                  fouls_drawn, fouls_committed,
                  yellow_cards, red_cards
                ) VALUES (
                  ${id}, ${teamId}, ${p.id},
                  ${g.games.minutes ?? null},
                  ${g.games.number ?? null},
                  ${g.games.position ?? null},
                  ${g.games.rating ? parseFloat(g.games.rating) : null},
                  ${g.games.captain ?? false},
                  ${g.games.substitute ?? false},
                  ${g.shots?.total ?? null}, ${g.shots?.on ?? null},
                  ${g.goals?.total ?? null}, ${g.goals?.assists ?? null},
                  ${g.goals?.saves ?? null}, ${g.goals?.conceded ?? null},
                  ${g.passes?.total ?? null}, ${g.passes?.key ?? null},
                  ${g.passes?.accuracy ?? null},
                  ${g.tackles?.total ?? null},
                  ${g.tackles?.blocks ?? null},
                  ${g.tackles?.interceptions ?? null},
                  ${g.duels?.total ?? null}, ${g.duels?.won ?? null},
                  ${g.dribbles?.attempts ?? null}, ${g.dribbles?.success ?? null},
                  ${g.fouls?.drawn ?? null}, ${g.fouls?.committed ?? null},
                  ${g.cards?.yellow ?? 0}, ${g.cards?.red ?? 0}
                )
                ON CONFLICT (fixture_id, player_id) DO UPDATE SET
                  rating = EXCLUDED.rating,
                  minutes = EXCLUDED.minutes,
                  goals = EXCLUDED.goals,
                  assists = EXCLUDED.assists,
                  yellow_cards = EXCLUDED.yellow_cards,
                  red_cards = EXCLUDED.red_cards
              `

              // players_master に未登録なら追加
              await sql`
                INSERT INTO players_master (id, name_en, team_id, position, updated_at)
                VALUES (${p.id}, ${p.name}, ${teamId}, ${g.games.position ?? null}, NOW())
                ON CONFLICT (id) DO NOTHING
              `
            }
          }
        }

        // --- オッズ保存 ---
        if (oddsRes.length > 0) {
          await sql`DELETE FROM fixture_odds WHERE fixture_id = ${id}`
          for (const bookmaker of oddsRes) {
            for (const bet of bookmaker.bets) {
              for (const val of bet.values) {
                await sql`
                  INSERT INTO fixture_odds (
                    fixture_id, bookmaker_id, bookmaker_name,
                    bet_id, bet_name, value, odd
                  ) VALUES (
                    ${id}, ${bookmaker.id}, ${bookmaker.name},
                    ${bet.id}, ${bet.name}, ${val.value},
                    ${parseFloat(val.odd)}
                  )
                  ON CONFLICT (fixture_id, bookmaker_id, bet_id, value) DO UPDATE SET
                    odd = EXCLUDED.odd
                `
              }
            }
          }
        }

        processed++
      } catch (err) {
        errors.push({ id, error: err.message })
      }
    }

    return Response.json({ ok: true, processed, errors: errors.length > 0 ? errors : undefined })
  } catch (err) {
    console.error(err)
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}
