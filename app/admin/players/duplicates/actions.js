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
