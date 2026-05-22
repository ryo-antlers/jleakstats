-- SINCE (supporter_since: 応援開始年) を廃止し、
-- 「初観戦試合 (first_match_fixture_id)」に置き換える。
--
-- - first_match_fixture_id  : 初めて観戦した試合 (fixtures FK、削除時 NULL)
-- - supporter_since         : 廃止 (data も消える)
--
-- クラブ変更時の対応:
--   /api/profile で「クラブ変更時は first_match_fixture_id も NULL」する。

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS first_match_fixture_id INTEGER
    REFERENCES fixtures(id) ON DELETE SET NULL;

ALTER TABLE user_profiles
  DROP COLUMN IF EXISTS supporter_since;
