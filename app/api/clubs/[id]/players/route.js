import { auth } from '@clerk/nextjs/server'
import sql from '@/lib/db'

// GET /api/clubs/[id]/players
//   - 指定クラブのアクティブな canonical 選手一覧 (POS順, 背番号順)
//   - プロフィール編集の「推し選手 Select」で使う
//   - 認証必須 (profile-setup 用)
export async function GET(_req, { params }) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const teamId = Number(id)
  if (!Number.isInteger(teamId) || teamId <= 0) {
    return Response.json({ error: 'Invalid team id' }, { status: 400 })
  }

  const players = await sql`
    SELECT
      pm.id,
      pm.name_ja,
      pm.name_en,
      pm.position,
      pm.no AS number
    FROM players_master pm
    WHERE pm.team_id = ${teamId}
      AND pm.is_active = true
      AND (pm.canonical_id IS NULL OR pm.canonical_id = pm.id)
    ORDER BY
      CASE pm.position
        WHEN 'GK' THEN 1 WHEN 'DF' THEN 2 WHEN 'MF' THEN 3 WHEN 'FW' THEN 4
        ELSE 5
      END,
      pm.no ASC NULLS LAST,
      pm.name_ja
  `

  return Response.json({ players })
}
