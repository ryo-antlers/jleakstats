-- watch_notes に座席タイプとタイムラインを追加
--   - seat_type: 'goal_back' (ゴール裏) / 'reserved' (指定席) ※ stadium 時のみ意味を持つ
--   - timeline:  JSONB 配列 [{time: 'HH:mm', text: '...'}] その日 1 日の行動メモ
ALTER TABLE watch_notes
  ADD COLUMN IF NOT EXISTS seat_type TEXT
    CHECK (seat_type IS NULL OR seat_type IN ('goal_back', 'reserved')),
  ADD COLUMN IF NOT EXISTS timeline JSONB NOT NULL DEFAULT '[]'::jsonb;
