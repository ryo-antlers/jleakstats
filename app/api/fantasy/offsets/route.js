import { auth } from '@clerk/nextjs/server'
import sql from '@/lib/db'

export async function POST(request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { offsets } = await request.json()
  // offsets: { [player_id]: { x, y } }

  await sql`
    ALTER TABLE fantasy_squads
    ADD COLUMN IF NOT EXISTS pos_offset_x INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS pos_offset_y INT DEFAULT 0
  `

  for (const [player_id, off] of Object.entries(offsets)) {
    await sql`
      UPDATE fantasy_squads
      SET pos_offset_x = ${Math.round(off.x ?? 0)}, pos_offset_y = ${Math.round(off.y ?? 0)}
      WHERE clerk_user_id = ${userId} AND player_id = ${parseInt(player_id)}
    `
  }

  return Response.json({ ok: true })
}
