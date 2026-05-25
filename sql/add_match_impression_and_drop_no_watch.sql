-- watch_notes 第二次簡素化 (2026-05-25)
--   - watch_type から 'no_watch' を削除 → 'stadium' / 'streaming' の 2 値のみに
--     既存 'no_watch' は 'streaming' に統合 (データ保護のため)
--   - match_impression (試合の感想) TEXT カラムを追加
--     stadium / streaming 両方で表示する公開フィールド

BEGIN;

ALTER TABLE watch_notes DROP CONSTRAINT IF EXISTS watch_notes_watch_type_check;

UPDATE watch_notes
SET watch_type = 'streaming'
WHERE watch_type = 'no_watch';

ALTER TABLE watch_notes
  ADD CONSTRAINT watch_notes_watch_type_check
  CHECK (watch_type IN ('stadium', 'streaming'));

ALTER TABLE watch_notes
  ADD COLUMN IF NOT EXISTS match_impression TEXT;

COMMIT;
