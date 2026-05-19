-- 2026-05-19 jlsp_* → fantype_* リネーム
--
-- 旧 JLSP 名残りのテーブル/カラムを fantype_ プレフィックスに統一する。
-- 姉妹サイトとして JLSP 名で新サイトを立ち上げるため、jleakstats 側の名前空間を譲る。
--
-- 適用順: このマイグレーションを Neon に適用 → 直後に jleakstats のデプロイで
-- fantype_* を参照する新コードを反映。短時間 (~1-2 分) の API 失敗を許容。
--
-- 影響:
--   * テーブル: jlsp_vector_overrides → fantype_vector_overrides
--   * テーブル: jlsp_question_overrides → fantype_question_overrides
--   * カラム: user_profiles.jlsp_type_code → fantype_type_code
--   * カラム: user_profiles.jlsp_answers → fantype_answers
--   * カラム: user_profiles.jlsp_updated_at → fantype_updated_at

BEGIN;

ALTER TABLE IF EXISTS jlsp_vector_overrides RENAME TO fantype_vector_overrides;
ALTER TABLE IF EXISTS jlsp_question_overrides RENAME TO fantype_question_overrides;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'jlsp_type_code'
  ) THEN
    ALTER TABLE user_profiles RENAME COLUMN jlsp_type_code TO fantype_type_code;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'jlsp_answers'
  ) THEN
    ALTER TABLE user_profiles RENAME COLUMN jlsp_answers TO fantype_answers;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'jlsp_updated_at'
  ) THEN
    ALTER TABLE user_profiles RENAME COLUMN jlsp_updated_at TO fantype_updated_at;
  END IF;
END $$;

COMMIT;
