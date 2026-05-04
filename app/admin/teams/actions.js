'use server'
import sql from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function updateTeam(_prev, formData) {
  const id = Number(formData.get('id'))
  if (!Number.isFinite(id) || id <= 0) return { error: 'IDが不正です' }

  // 入力値を正規化
  const trim = (v) => {
    const s = String(v ?? '').trim()
    return s.length === 0 ? null : s
  }
  const short_name = trim(formData.get('short_name'))
  const abbr = trim(formData.get('abbr'))
  const colorRaw = trim(formData.get('color_primary'))
  // 既存データは #付き なので #付きで正規化
  const color_primary = colorRaw
    ? `#${colorRaw.replace(/^#/, '').toLowerCase()}`
    : null

  // 簡易バリデーション
  if (color_primary && !/^#[0-9a-f]{6}$/i.test(color_primary)) {
    return { error: 'カラーコードは 6桁の16進数で指定してください (例: #8b1a1a)' }
  }
  if (abbr && abbr.length > 6) return { error: 'abbrは6文字以内' }
  if (short_name && short_name.length > 20) return { error: 'short_nameは20文字以内' }

  try {
    await sql`
      UPDATE teams_master SET
        short_name    = ${short_name},
        abbr          = ${abbr},
        color_primary = ${color_primary}
      WHERE id = ${id}
    `
  } catch (err) {
    return { error: `保存失敗: ${err.message}` }
  }

  revalidatePath('/admin/teams')
  revalidatePath('/')
  return { success: true, savedAt: Date.now() }
}
