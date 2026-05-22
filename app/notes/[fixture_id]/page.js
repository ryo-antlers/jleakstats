import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// /notes/[fixture_id] は廃止 → /rating/[fixture_id] へ統合
//   (採点と観戦ノートを 1 画面で扱うため)
//
// 既存リンクや過去のブックマーク経由のアクセスをリダイレクト。
// 編集フォーム本体 (note-form.js) は /rating/[fixture_id] から import される。
export default async function NoteRedirect({ params }) {
  const { fixture_id } = await params
  redirect(`/rating/${fixture_id}`)
}
