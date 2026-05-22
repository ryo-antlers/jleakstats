-- 住所機能をユーザー単位 → 試合ごとの「観戦ノート出発地」に移行
--
-- 1. user_profiles から住所関連 (prefecture, city, address_private) を DROP
-- 2. watch_notes に departure_prefecture, departure_city を追加
--    (watch_type='stadium' の試合に限り意味を持つ。バリデーションは API 側で実施)
--
-- 移動距離の算出も、ユーザーの一括住所からではなく、
-- 各試合のノートに記録された出発地から計算するようになる (lib/notes/distance.js)。

ALTER TABLE user_profiles
  DROP COLUMN IF EXISTS prefecture,
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS address_private;

ALTER TABLE watch_notes
  ADD COLUMN IF NOT EXISTS departure_prefecture TEXT,
  ADD COLUMN IF NOT EXISTS departure_city       TEXT;
