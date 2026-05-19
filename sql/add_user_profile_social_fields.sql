-- user_profiles に SNS 的フィールドを追加
--   jersey_number       : 今季のユニ背番号 (1-99)
--   favorite_player_id  : 推し選手 (推しクラブの players_master を参照、削除時 NULL)
--   prefecture          : 住所 (都道府県)
--   city                : 住所 (市区町村) — Phase 2 で緯度経度+移動距離計算に使う
--   bio                 : ひとこと (最大80字)
--   supporter_since     : サポ歴 (年) — 1993 以降

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS jersey_number SMALLINT
    CHECK (jersey_number IS NULL OR (jersey_number BETWEEN 1 AND 99)),
  ADD COLUMN IF NOT EXISTS favorite_player_id INTEGER
    REFERENCES players_master(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prefecture TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS bio VARCHAR(80),
  ADD COLUMN IF NOT EXISTS supporter_since SMALLINT
    CHECK (supporter_since IS NULL OR (supporter_since BETWEEN 1993 AND 2030));
