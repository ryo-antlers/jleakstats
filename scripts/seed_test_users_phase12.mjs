// テストユーザー 2 名 (マリノス太郎 / ゼルビア花子) に
// Phase 1 (SNS フィールド) + Phase 2 (観戦ノート) のテストデータを投入する。
//
// 使い方:
//   node scripts/seed_test_users_phase12.mjs
//
// 冪等: 既存値があれば UPDATE / 観戦ノートも ON CONFLICT で更新。
//
// 対象ユーザー:
//   - user_test_marinos01 (handle: marinos_taro) → 横浜F・マリノス (team_id=296, 日産スタジアム)
//   - user_test_zelvia01  (handle: zelvia_hanako) → FC町田ゼルビア (team_id=303, 町田GIONスタジアム)

import { neon } from '@neondatabase/serverless'
import dotenv from 'dotenv'
dotenv.config({ path: '/Users/ryo/Desktop/jleakstats/.env.local' })
const sql = neon(process.env.DATABASE_URL)

// ───── Phase 1 プロフィール ─────
const PROFILES = [
  {
    clerk_user_id: 'user_test_marinos01',
    display_name: 'マリノス太郎',
    handle: 'marinos_taro',
    avatar_text: 'マリ',
    supported_club_id: 296,         // 横浜F・マリノス
    favorite_player_no: 6,          // 渡辺 皓太
    jersey_number: 6,
    prefecture: '神奈川県',
    city: '横浜市西区',
    bio: 'マリサポ歴17年。アウェイも全部行きたい派。今年は J1 残留が目標…でも信じてる。',
    supporter_since: 2009,
  },
  {
    clerk_user_id: 'user_test_zelvia01',
    display_name: 'ゼルビア花子',
    handle: 'zelvia_hanako',
    avatar_text: 'ゼル',
    supported_club_id: 303,         // FC町田ゼルビア
    favorite_player_no: 7,          // 相馬 勇紀
    jersey_number: 7,
    prefecture: '東京都',
    city: '町田市',
    bio: '町田の街と一緒に J1 を駆け上がる！ホームは徒歩で参戦できるのが幸せ。',
    supporter_since: 2018,
  },
]

// ───── Phase 2 観戦ノートの「パターン」 ─────
// 推しクラブの直近終了試合 (新しい順) に対して、index 0,1,2,... と
// このパターンを順に当てはめる。stadium 以外でも companion/memo を埋めて
// 「DAZN でも記録に意味がある」感じを出す。
const NOTE_PATTERNS = {
  marinos_taro: [
    // 第17節 (H) 柏戦 — 現地、電車、悔しい
    { watch_type: 'stadium', access: 'train', companion: '夫と', memo: '雨で寒かったけど勝てるかと思ったのに…後半の失点で頭真っ白。' },
    // 第16節 (H) 鹿島戦 — 現地、電車、引き分け
    { watch_type: 'stadium', access: 'train', companion: 'マリサポ仲間と3人', memo: '鹿島相手にドロー。残留争いの大事な勝点1。' },
    // 第15節 (A) 町田戦 — DAZN、勝った
    { watch_type: 'dazn',    access: null,    companion: '夫と', memo: '町田までアウェイ参戦したかった…DAZN でも 2-0 勝利は気持ちよかった！' },
    // 第14節 (H) 水戸戦 — 現地、電車、ドロー
    { watch_type: 'stadium', access: 'train', companion: 'ひとり', memo: '昇格組相手にホームで取りこぼし…J1 残留厳しい。' },
    // 第13節 (A) 千葉戦 — TV (ハイライト的に)
    { watch_type: 'tv',      access: null,    companion: null,    memo: '仕事で開始直後しか見られず…2-3 で負けたと知って凹んだ。' },
  ],
  zelvia_hanako: [
    // 第17節 (A) 川崎戦 — DAZN
    { watch_type: 'dazn',    access: null,    companion: 'ひとり', memo: '川崎相手にアウェイで引き分けは上出来！' },
    // 第12節 (H) 東京V戦 — 現地、徒歩
    { watch_type: 'stadium', access: 'walk',  companion: '父と',  memo: '東京クラシコ！スコアレスドローだけど熱い試合だった。' },
    // 第16節 (A) 千葉戦 — 観てない
    { watch_type: 'no_watch', access: null,   companion: null,    memo: '結婚式で観られず…後で結果見て凹んだ。' },
    // 第15節 (H) 横浜FM戦 — 現地、徒歩、勝った
    { watch_type: 'stadium', access: 'walk',  companion: '友達と4人', memo: 'J1 経験クラブを 2-0 で撃破！町田のサッカー最高すぎる。' },
    // 第14節 (A) 鹿島戦 — TV
    { watch_type: 'tv',      access: null,    companion: '父と',  memo: 'アウェイ参戦できず実家で観戦。1-1 のドロー、敵地で勝点 1 持ち帰り。' },
  ],
}

async function main() {
  console.log('=== Phase 1 + Phase 2 テストデータ投入 ===\n')

  for (const p of PROFILES) {
    console.log(`▶ ${p.display_name} (${p.handle})`)

    // 推し選手 ID を背番号 + クラブ ID で解決
    const playerRows = await sql`
      SELECT id, name_ja FROM players_master
      WHERE team_id = ${p.supported_club_id}
        AND no = ${p.favorite_player_no}
        AND is_active = true
        AND (canonical_id IS NULL OR canonical_id = id)
      LIMIT 1
    `
    const favoritePlayerId = playerRows[0]?.id ?? null
    console.log(`  推し選手: #${p.favorite_player_no} ${playerRows[0]?.name_ja ?? '(見つからず)'}  → favorite_player_id=${favoritePlayerId}`)

    // user_profiles UPDATE (既存行は前提)
    await sql`
      UPDATE user_profiles SET
        display_name       = ${p.display_name},
        handle             = ${p.handle},
        avatar_text        = ${p.avatar_text},
        supported_club_id  = ${p.supported_club_id},
        jersey_number      = ${p.jersey_number},
        favorite_player_id = ${favoritePlayerId},
        prefecture         = ${p.prefecture},
        city               = ${p.city},
        bio                = ${p.bio},
        supporter_since    = ${p.supporter_since},
        updated_at         = NOW()
      WHERE clerk_user_id = ${p.clerk_user_id}
    `
    console.log(`  ✓ プロフィール更新`)

    // 観戦ノート: 推しクラブの終了試合を新しい順で取得し、パターンを順に当てる
    const fixtures = await sql`
      SELECT id FROM fixtures
      WHERE season = 2026 AND finished_at IS NOT NULL
        AND (home_team_id = ${p.supported_club_id} OR away_team_id = ${p.supported_club_id})
      ORDER BY date DESC
      LIMIT ${NOTE_PATTERNS[p.handle].length}
    `
    const patterns = NOTE_PATTERNS[p.handle]
    let added = 0
    for (let i = 0; i < Math.min(fixtures.length, patterns.length); i++) {
      const f = fixtures[i]
      const n = patterns[i]
      await sql`
        INSERT INTO watch_notes (clerk_user_id, fixture_id, watch_type, access, companion, memo)
        VALUES (${p.clerk_user_id}, ${f.id}, ${n.watch_type}, ${n.access}, ${n.companion}, ${n.memo})
        ON CONFLICT (clerk_user_id, fixture_id) DO UPDATE SET
          watch_type = EXCLUDED.watch_type,
          access     = EXCLUDED.access,
          companion  = EXCLUDED.companion,
          memo       = EXCLUDED.memo,
          updated_at = NOW()
      `
      added++
    }
    console.log(`  ✓ 観戦ノート ${added} 件投入`)
    console.log()
  }

  // ───── 確認 ─────
  console.log('=== 投入結果確認 ===\n')
  for (const p of PROFILES) {
    const prof = await sql`
      SELECT up.display_name, up.handle, up.jersey_number, up.prefecture, up.city,
             up.bio, up.supporter_since,
             fp.name_ja AS favorite_player_name
      FROM user_profiles up
      LEFT JOIN players_master fp ON fp.id = up.favorite_player_id
      WHERE up.clerk_user_id = ${p.clerk_user_id}
    `
    const stats = await sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE watch_type = 'stadium')::int AS stadium
      FROM watch_notes WHERE clerk_user_id = ${p.clerk_user_id}
    `
    const r = prof[0]
    const s = stats[0]
    console.log(`▶ ${r.display_name} (@${r.handle})`)
    console.log(`  推し: ${r.favorite_player_name} (#${r.jersey_number})`)
    console.log(`  住所: ${r.prefecture} ${r.city}`)
    console.log(`  bio:  ${r.bio}`)
    console.log(`  since ${r.supporter_since}'`)
    console.log(`  ノート: 計 ${s.total} 件 (うち現地観戦 ${s.stadium} 件)`)
    console.log()
  }

  console.log('=== 完了 ===')
}

main().catch(e => { console.error(e); process.exit(1) })
