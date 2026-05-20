-- 観戦ノートテーブル
--   - 試合ごとに「観戦区分・アクセス手段・同行者・メモ」を記録
--   - 同じユーザー × 同じ試合は 1 件 (UNIQUE)
--   - Phase 2c で watch_type='stadium' の試合のスタジアム緯度経度から移動距離合計を算出

CREATE TABLE IF NOT EXISTS watch_notes (
  id            BIGSERIAL PRIMARY KEY,
  clerk_user_id TEXT     NOT NULL,
  fixture_id    INTEGER  NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  watch_type    TEXT     NOT NULL CHECK (watch_type IN ('stadium','dazn','tv','no_watch')),
  access        TEXT     CHECK (access IS NULL OR access IN ('train','car','bus','walk','other')),
  companion     TEXT,
  memo          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clerk_user_id, fixture_id)
);

CREATE INDEX IF NOT EXISTS idx_watch_notes_user_fixture
  ON watch_notes(clerk_user_id, fixture_id);
CREATE INDEX IF NOT EXISTS idx_watch_notes_fixture
  ON watch_notes(fixture_id);
