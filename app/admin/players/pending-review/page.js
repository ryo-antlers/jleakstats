import sql from '@/lib/db'
import PendingReviewClient from './pending-client'

export const revalidate = 0

async function getPending() {
  return await sql`
    SELECT
      pr.id, pr.source, pr.external_id, pr.observed_name, pr.observed_team_id,
      pr.observed_dob, pr.candidate_canonicals, pr.reason, pr.status, pr.created_at,
      t.name_ja AS team_name, t.short_name AS team_short, t.color_primary AS team_color
    FROM pending_reviews pr
    LEFT JOIN teams_master t ON t.id = pr.observed_team_id
    WHERE pr.status = 'pending'
    ORDER BY pr.created_at DESC
  `.catch(() => [])
}

async function getCanonicalCandidatesInfo(ids) {
  if (!ids || ids.length === 0) return []
  return await sql`
    SELECT pm.id, pm.name_ja, pm.dob, pm.position, t.short_name AS team_short
    FROM players_master pm
    LEFT JOIN teams_master t ON t.id = pm.team_id
    WHERE pm.id = ANY(${ids})
  `.catch(() => [])
}

export default async function PendingReviewPage() {
  const pending = await getPending()

  // 候補 canonical 詳細を一括取得
  const allCandidateIds = [...new Set(pending.flatMap(p => p.candidate_canonicals ?? []))]
  const candidateInfos = await getCanonicalCandidatesInfo(allCandidateIds)
  const candidateMap = new Map(candidateInfos.map(c => [c.id, c]))

  return (
    <div style={{ padding: '24px 16px', maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '0.05em', marginBottom: 8 }}>
        Pending Reviews
      </h1>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 24 }}>
        外部IDの自動紐付けに失敗した選手 ({pending.length}件)。7桁の J-League ID を入力して canonical に紐付けてください。
      </p>

      {pending.length === 0 ? (
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>保留中なし 🎉</p>
      ) : (
        <PendingReviewClient pending={pending} candidateMap={Object.fromEntries(candidateMap)} />
      )}
    </div>
  )
}
