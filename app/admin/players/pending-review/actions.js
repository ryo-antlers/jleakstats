'use server'

import sql from '@/lib/db'
import { revalidatePath } from 'next/cache'

// 7桁の J-League ID から canonical を解決して、API-Football ID を紐付ける
export async function resolveByJleagueId({ pendingId, jleagueJpId }) {
  if (!pendingId || !jleagueJpId) {
    return { ok: false, error: '必須パラメータ不足' }
  }
  const trimmed = String(jleagueJpId).trim()
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: 'J-League ID は数字のみ' }
  }

  // pending 情報取得
  const pendingRows = await sql`SELECT * FROM pending_reviews WHERE id = ${pendingId}`
  if (pendingRows.length === 0) return { ok: false, error: 'pending_review が見つからない' }
  const pending = pendingRows[0]
  if (pending.status !== 'pending') return { ok: false, error: `既に ${pending.status} 状態` }

  // 7桁ID から canonical 解決
  const canonicalRows = await sql`
    SELECT canonical_id FROM player_external_ids
    WHERE source = 'j-league-jp' AND external_id = ${trimmed}
  `
  if (canonicalRows.length === 0) {
    return { ok: false, error: `7桁ID ${trimmed} が player_external_ids に登録されていない (CSV未取込?)` }
  }
  const canonicalId = canonicalRows[0].canonical_id

  // canonical 行の情報取得 (確認用)
  const canonical = (await sql`
    SELECT pm.id, pm.name_ja, t.short_name AS team
    FROM players_master pm LEFT JOIN teams_master t ON t.id = pm.team_id
    WHERE pm.id = ${canonicalId}
  `)[0]

  try {
    // 1トランザクションで:
    //   - 該当 source の external_id 紐付け
    //   - pending_review を resolved
    //   - audit log
    await sql.transaction([
      sql`
        INSERT INTO player_external_ids (canonical_id, source, external_id)
        VALUES (${canonicalId}, ${pending.source}, ${pending.external_id})
        ON CONFLICT (source, external_id) DO NOTHING
      `,
      sql`
        UPDATE pending_reviews
        SET status = 'resolved',
            resolved_canonical_id = ${canonicalId},
            resolved_by = 'admin',
            resolved_at = NOW()
        WHERE id = ${pendingId}
      `,
      sql`
        INSERT INTO canonical_audit_log (action, canonical_id, target_id, payload, actor)
        VALUES ('pending_review_resolved', ${canonicalId}, ${pendingId}, ${JSON.stringify({
          source: pending.source,
          external_id: pending.external_id,
          observed_name: pending.observed_name,
          jleague_jp_id: trimmed,
        })}::jsonb, 'admin')
      `,
    ])
  } catch (e) {
    return { ok: false, error: e.message }
  }

  revalidatePath('/admin/players/pending-review')
  return {
    ok: true,
    message: `紐付け成功: ${pending.observed_name ?? pending.external_id} → ${canonical?.name_ja ?? canonicalId} (${canonical?.team ?? '?'})`,
  }
}

// 「別人として skip」 (誤検知時)
export async function skipPending({ pendingId, reason }) {
  if (!pendingId) return { ok: false, error: '必須パラメータ不足' }

  await sql`
    UPDATE pending_reviews
    SET status = 'skipped', resolved_by = 'admin', resolved_at = NOW(),
        reason = COALESCE(reason || ' / ', '') || ${'skipped: ' + (reason ?? 'no_reason')}
    WHERE id = ${pendingId}
  `

  revalidatePath('/admin/players/pending-review')
  return { ok: true, message: 'skip しました' }
}
