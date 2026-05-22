-- /u/[id] ヘッダー再設計に伴う user_profiles のスキーマ調整
--   - address_private (新規)  : 住所を /u/[id] で非表示にする設定。デフォルト false (=公開)
--   - bio                     : 「ひとこと」フィールドを廃止 (フォーム/表示から削除済み)
--
-- 適用順: bio を DROP する前に、フォーム/コードで bio 参照を全部削除しておく。
-- このマイグレーション自体は冪等。

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS address_private BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE user_profiles
  DROP COLUMN IF EXISTS bio;
