import sql from '@/lib/db'

export async function GET() {
  const fixtures = await sql`
    SELECT id, date, round_number
    FROM fixtures
    WHERE season = 2026 AND round_number IS NOT NULL
    ORDER BY date ASC
    LIMIT 5
  `
  return Response.json({
    samples: fixtures.map(f => ({
      id: f.id,
      date_raw: f.date,
      date_typeof: typeof f.date,
      date_toString: String(f.date),
      date_iso: f.date instanceof Date ? f.date.toISOString() : 'not a Date',
      jst: f.date instanceof Date
        ? new Date(f.date.getTime() + 9 * 3600000).toISOString().slice(0, 10)
        : new Date(new Date(f.date).getTime() + 9 * 3600000).toISOString().slice(0, 10),
    }))
  })
}
