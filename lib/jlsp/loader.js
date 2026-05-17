import sql from '@/lib/db'
import { applyVectorOverrides, CLUBS } from './clubs'

/**
 * JLSP の clubId (例: "omiya") と jleakstats teams_master.name_ja の例外マッピング。
 * 改称や略記の差で一致しないケースをここに集める。
 */
const NAME_OVERRIDES = {
  omiya: 'ＲＢ大宮アルディージャ',
}

/**
 * server-only: DB から JLSP の上書きデータをまとめて読み込む。
 * 失敗時は空オブジェクトを返してフォールバック (基準値のみで動く)。
 *
 * 戻り値:
 *   {
 *     clubs: Club[],                        // vector override 適用済み
 *     vectorOverrides: { clubId: { axisId: value } },
 *     questionOverrides: { clubId: { qid: value } },
 *   }
 */
export async function loadJlspState() {
  const [vectorRows, questionRows, teamRows] = await Promise.all([
    sql`SELECT club_id, axis_id, value FROM jlsp_vector_overrides`.catch(() => []),
    sql`SELECT club_id, question_id, value FROM jlsp_question_overrides`.catch(() => []),
    sql`SELECT id, name_ja FROM teams_master`.catch(() => []),
  ])

  const vectorOverrides = {}
  for (const r of vectorRows) {
    if (!vectorOverrides[r.club_id]) vectorOverrides[r.club_id] = {}
    vectorOverrides[r.club_id][r.axis_id] = Number(r.value)
  }

  const questionOverrides = {}
  for (const r of questionRows) {
    if (!questionOverrides[r.club_id]) questionOverrides[r.club_id] = {}
    questionOverrides[r.club_id][r.question_id] = Number(r.value)
  }

  // teams_master.name_ja → id のマップを作り、JLSP clubId → teamId に変換
  const idByName = new Map(teamRows.map((r) => [r.name_ja, Number(r.id)]))
  const teamIdByClubId = {}
  for (const c of CLUBS) {
    const lookupName = NAME_OVERRIDES[c.id] ?? c.name
    const tid = idByName.get(lookupName)
    if (tid) teamIdByClubId[c.id] = tid
  }

  const clubs = applyVectorOverrides(vectorOverrides)
  return { clubs, vectorOverrides, questionOverrides, teamIdByClubId }
}
