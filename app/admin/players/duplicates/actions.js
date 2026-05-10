'use server'

import sql from '@/lib/db'
import { revalidatePath } from 'next/cache'

// 2つの canonical を merge: loser を winner の alias 化
// - players_master.canonical_id を更新
// - player_aliases / player_external_ids を winner に集約
// - 1トランザクションで安全に
export async function mergeCanonicals({ winnerId, loserId, reason }) {
  if (!winnerId || !loserId) return { ok: false, error: '必須パラメータ不足' }
  if (winnerId === loserId) return { ok: false, error: '同じ ID' }

  // 確認: 両方とも canonical (canonical_id IS NULL or = id)
  const winner = await sql`
    SELECT id, name_ja, team_id FROM players_master
    WHERE id = ${winnerId} AND (canonical_id IS NULL OR canonical_id = id)
  `
  const loser = await sql`
    SELECT id, name_ja, team_id FROM players_master
    WHERE id = ${loserId} AND (canonical_id IS NULL OR canonical_id = id)
  `
  if (winner.length === 0) return { ok: false, error: `winner (${winnerId}) は canonical でない` }
  if (loser.length === 0) return { ok: false, error: `loser (${loserId}) は canonical でない` }

  try {
    await sql.transaction([
      // 1. loser の alias を winner にコピー (重複は skip)
      sql`
        INSERT INTO player_aliases (canonical_id, name_ja, normalized, source)
        SELECT ${winnerId}, name_ja, normalized, source
        FROM player_aliases
        WHERE canonical_id = ${loserId}
        ON CONFLICT (canonical_id, normalized) DO NOTHING
      `,
      // 2. loser の external_ids を winner にコピー (重複は skip)
      sql`
        INSERT INTO player_external_ids (canonical_id, source, external_id, observed_at)
        SELECT ${winnerId}, source, external_id, observed_at
        FROM player_external_ids
        WHERE canonical_id = ${loserId}
        ON CONFLICT (source, external_id) DO NOTHING
      `,
      // 3. loser に紐付いてた alias / external_ids を削除
      sql`DELETE FROM player_aliases WHERE canonical_id = ${loserId}`,
      sql`DELETE FROM player_external_ids WHERE canonical_id = ${loserId}`,
      // 4. players_master: loser とそのaliases を winner に向ける
      sql`
        UPDATE players_master
        SET canonical_id = ${winnerId}, updated_at = NOW()
        WHERE id = ${loserId} OR canonical_id = ${loserId}
      `,
      // 5. audit log
      sql`
        INSERT INTO canonical_audit_log (action, canonical_id, target_id, payload, actor)
        VALUES ('manual_merge', ${winnerId}, ${loserId}, ${JSON.stringify({
          winner_name: winner[0].name_ja,
          loser_name: loser[0].name_ja,
          reason: reason ?? null,
        })}::jsonb, 'admin')
      `,
    ])
  } catch (e) {
    return { ok: false, error: e.message }
  }

  revalidatePath('/admin/players/duplicates')
  return {
    ok: true,
    message: `merge: ${loser[0].name_ja} (${loserId}) → ${winner[0].name_ja} (${winnerId})`,
  }
}

// fixture_lineups / fps / fe で source_player_id × team_id の records を target に再割当て
// 用途: 同名混同で誤って別人の試合データが付いた場合の修正
export async function reassignFixtureRecords({ sourcePlayerId, teamId, targetPlayerId, reason }) {
  if (!sourcePlayerId || !teamId || !targetPlayerId) {
    return { ok: false, error: '必須パラメータ不足' }
  }
  const sId = Number(sourcePlayerId)
  const tId = Number(teamId)
  const tgtId = Number(targetPlayerId)
  if (!Number.isFinite(sId) || !Number.isFinite(tId) || !Number.isFinite(tgtId)) {
    return { ok: false, error: 'IDは整数' }
  }
  if (sId === tgtId) return { ok: false, error: 'source と target が同じ' }

  // target が存在するか確認
  const target = await sql`SELECT id, name_ja, canonical_id FROM players_master WHERE id = ${tgtId}`
  if (target.length === 0) return { ok: false, error: `target id ${tgtId} が存在しない` }

  const source = await sql`SELECT id, name_ja FROM players_master WHERE id = ${sId}`

  // 影響件数を事前確認
  const counts = await sql`
    SELECT
      (SELECT COUNT(*) FROM fixture_lineups WHERE player_id = ${sId} AND team_id = ${tId})::int AS lineups,
      (SELECT COUNT(*) FROM fixture_player_stats WHERE player_id = ${sId} AND team_id = ${tId})::int AS stats,
      (SELECT COUNT(*) FROM fixture_events WHERE player_id = ${sId} AND team_id = ${tId})::int AS events
  `
  const c = counts[0]
  const total = (c.lineups ?? 0) + (c.stats ?? 0) + (c.events ?? 0)
  if (total === 0) return { ok: false, error: `対象レコードなし (player=${sId}, team=${tId})` }

  try {
    await sql.transaction([
      sql`UPDATE fixture_lineups SET player_id = ${tgtId} WHERE player_id = ${sId} AND team_id = ${tId}`,
      sql`UPDATE fixture_player_stats SET player_id = ${tgtId} WHERE player_id = ${sId} AND team_id = ${tId}`,
      sql`UPDATE fixture_events SET player_id = ${tgtId} WHERE player_id = ${sId} AND team_id = ${tId}`,
      sql`
        INSERT INTO canonical_audit_log (action, canonical_id, target_id, payload, actor)
        VALUES ('reassign_fixture_records', ${tgtId}, ${sId}, ${JSON.stringify({
          source_player_id: sId,
          source_name: source[0]?.name_ja,
          target_player_id: tgtId,
          target_name: target[0].name_ja,
          team_id: tId,
          counts: c,
          reason: reason ?? null,
        })}::jsonb, 'admin')
      `,
    ])
  } catch (e) {
    return { ok: false, error: e.message }
  }

  revalidatePath('/admin/players/duplicates')
  return {
    ok: true,
    message: `reassign 成功: ${total}件 (lineups=${c.lineups}, stats=${c.stats}, events=${c.events}) を ${source[0]?.name_ja ?? sId} → ${target[0].name_ja ?? tgtId}`,
  }
}

// 「別人として残す」: skip 記録 (audit log のみ、変更なし)
export async function skipDuplicate({ ids, reason }) {
  if (!ids || ids.length < 2) return { ok: false, error: '必須パラメータ不足' }

  await sql`
    INSERT INTO canonical_audit_log (action, payload, actor)
    VALUES ('manual_skip_duplicate', ${JSON.stringify({ ids, reason: reason ?? null })}::jsonb, 'admin')
  `
  revalidatePath('/admin/players/duplicates')
  return { ok: true, message: `skip: ids=${ids.join(',')} を別人として記録` }
}
