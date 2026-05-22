-- watch_notes の memo (試合の感想) を next_visit_memo (次回観戦時の備忘メモ) に置き換える
--   - 「次回ここに来るとき思い出したいこと」を記録する欄
--   - 既存の memo データは消える (テストデータ前提)

ALTER TABLE watch_notes
  DROP COLUMN IF EXISTS memo,
  ADD COLUMN IF NOT EXISTS next_visit_memo TEXT;
