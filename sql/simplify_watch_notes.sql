-- watch_notes の大幅簡素化 (2026-05-25)
--   - watch_type: 'stadium','dazn','tv','no_watch' → 'stadium','streaming','no_watch'
--     既存 'dazn' と 'tv' は 'streaming' に統合
--   - access / companion / seat_type / departure_prefecture / departure_city を完全削除
--   - 次回観戦時の備忘メモ (next_visit_memo) は残す
--   - 1 日のタイムライン (timeline JSONB) は残す
--   - 総移動距離機能 (departure_* 由来) は廃止

BEGIN;

-- 1) CHECK 制約を一旦外して watch_type の値を移行
ALTER TABLE watch_notes DROP CONSTRAINT IF EXISTS watch_notes_watch_type_check;

UPDATE watch_notes
SET watch_type = 'streaming'
WHERE watch_type IN ('dazn', 'tv');

-- 2) 新しい CHECK 制約 (3 値)
ALTER TABLE watch_notes
  ADD CONSTRAINT watch_notes_watch_type_check
  CHECK (watch_type IN ('stadium', 'streaming', 'no_watch'));

-- 3) 不要カラム削除
ALTER TABLE watch_notes DROP COLUMN IF EXISTS access;
ALTER TABLE watch_notes DROP COLUMN IF EXISTS companion;
ALTER TABLE watch_notes DROP COLUMN IF EXISTS seat_type;
ALTER TABLE watch_notes DROP COLUMN IF EXISTS departure_prefecture;
ALTER TABLE watch_notes DROP COLUMN IF EXISTS departure_city;

COMMIT;
