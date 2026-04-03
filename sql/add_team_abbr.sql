ALTER TABLE teams_master ADD COLUMN IF NOT EXISTS abbr TEXT;

UPDATE teams_master SET abbr = 'ANT' WHERE id = 290; -- 鹿島アントラーズ
UPDATE teams_master SET abbr = 'REY' WHERE id = 281; -- 柏レイソル
UPDATE teams_master SET abbr = 'RED' WHERE id = 287; -- 浦和レッズ
UPDATE teams_master SET abbr = 'FCT' WHERE id = 292; -- FC東京
UPDATE teams_master SET abbr = 'FRO' WHERE id = 294; -- 川崎フロンターレ
UPDATE teams_master SET abbr = 'MAR' WHERE id = 296; -- 横浜F・マリノス
UPDATE teams_master SET abbr = 'ZEL' WHERE id = 303; -- FC町田ゼルビア
UPDATE teams_master SET abbr = 'HOL' WHERE id = 305; -- 水戸ホーリーホック
UPDATE teams_master SET abbr = 'VER' WHERE id = 306; -- 東京ヴェルディ
UPDATE teams_master SET abbr = 'JEF' WHERE id = 301; -- ジェフユナイテッド千葉
UPDATE teams_master SET abbr = 'SAN' WHERE id = 282; -- サンフレッチェ広島
UPDATE teams_master SET abbr = 'ESP' WHERE id = 283; -- 清水エスパルス
UPDATE teams_master SET abbr = 'VFA' WHERE id = 285; -- V・ファーレン長崎
UPDATE teams_master SET abbr = 'GRA' WHERE id = 288; -- 名古屋グランパス
UPDATE teams_master SET abbr = 'VIS' WHERE id = 289; -- ヴィッセル神戸
UPDATE teams_master SET abbr = 'CER' WHERE id = 291; -- セレッソ大阪
UPDATE teams_master SET abbr = 'GAN' WHERE id = 293; -- ガンバ大阪
UPDATE teams_master SET abbr = 'SAG' WHERE id = 302; -- 京都サンガF.C.
UPDATE teams_master SET abbr = 'FAG' WHERE id = 310; -- ファジアーノ岡山
UPDATE teams_master SET abbr = 'AVI' WHERE id = 316; -- アビスパ福岡
