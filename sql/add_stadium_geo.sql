-- teams_master にホームスタジアム情報を追加
--   home_stadium_name : スタジアム正式名 (例: 日産スタジアム)
--   home_stadium_lat  : 緯度 (NUMERIC(8, 5), 約 1m 精度)
--   home_stadium_lng  : 経度 (NUMERIC(8, 5))
--
-- Phase 2c で「現地観戦」した試合のスタジアム ←→ ユーザー市町村 の
-- 大円距離 (Haversine) を合計して「今季の移動距離」を表示する。

ALTER TABLE teams_master
  ADD COLUMN IF NOT EXISTS home_stadium_name TEXT,
  ADD COLUMN IF NOT EXISTS home_stadium_lat  NUMERIC(8, 5),
  ADD COLUMN IF NOT EXISTS home_stadium_lng  NUMERIC(8, 5);
