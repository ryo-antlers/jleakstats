-- JLSP診断 (J-League Supporter Personality) 用テーブル
-- 4軸ベクトル override と 質問単位 expected answer override を保持する。
-- 基準値 (RAW_CLUBS) は lib/jlsp/clubs.js に直書き、ここで上書き分のみ管理する。

-- 4軸ベクトル override
--   axis_id: 'shoubu' | 'soshiki' | 'keiei' | 'nekkyou'
--   value  : -2 ~ +2
CREATE TABLE IF NOT EXISTS jlsp_vector_overrides (
  club_id    TEXT    NOT NULL,
  axis_id    TEXT    NOT NULL,
  value      INTEGER NOT NULL CHECK (value BETWEEN -2 AND 2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (club_id, axis_id)
);

-- 質問単位 expected answer override
--   question_id: 'q01' ~ 'q32'
--   value      : -3 ~ +3 (Likert step)
CREATE TABLE IF NOT EXISTS jlsp_question_overrides (
  club_id     TEXT    NOT NULL,
  question_id TEXT    NOT NULL,
  value       INTEGER NOT NULL CHECK (value BETWEEN -3 AND 3),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (club_id, question_id)
);
