-- J1/J2/J3 全 60 クラブのホームスタジアム名 + 緯度経度を投入
--   出典: 各クラブ・スタジアム Wikipedia 記事 (2026年シーズン時点のホーム)
--   座標精度は小数 5 桁 (約 1m)、実用上はピッチ中央付近を採用
--   命名権スポンサーが変わっても代表的呼称で記録 (運用時に上書き可)

-- ────────────── 東日本 (EAST / EAST-A / EAST-B) ──────────────
UPDATE teams_master SET home_stadium_name='札幌ドーム',                       home_stadium_lat=42.98556, home_stadium_lng=141.40972 WHERE id=279;   -- 北海道コンサドーレ札幌
UPDATE teams_master SET home_stadium_name='ヤマハスタジアム',                    home_stadium_lat=34.71667, home_stadium_lng=137.83333 WHERE id=280;   -- ジュビロ磐田
UPDATE teams_master SET home_stadium_name='三協フロンテア柏スタジアム',              home_stadium_lat=35.85694, home_stadium_lng=139.97306 WHERE id=281;   -- 柏レイソル
UPDATE teams_master SET home_stadium_name='レモンガススタジアム平塚',                home_stadium_lat=35.32194, home_stadium_lng=139.32500 WHERE id=284;   -- 湘南ベルマーレ
UPDATE teams_master SET home_stadium_name='ユアテックスタジアム仙台',                home_stadium_lat=38.30750, home_stadium_lng=140.88333 WHERE id=286;   -- ベガルタ仙台
UPDATE teams_master SET home_stadium_name='埼玉スタジアム2002',                  home_stadium_lat=35.90306, home_stadium_lng=139.71722 WHERE id=287;   -- 浦和レッズ
UPDATE teams_master SET home_stadium_name='メルカリスタジアム',                    home_stadium_lat=35.99250, home_stadium_lng=140.64083 WHERE id=290;   -- 鹿島アントラーズ
UPDATE teams_master SET home_stadium_name='味の素スタジアム',                     home_stadium_lat=35.66432, home_stadium_lng=139.52729 WHERE id=292;   -- FC東京
UPDATE teams_master SET home_stadium_name='Uvanceとどろきスタジアム by Fujitsu', home_stadium_lat=35.58444, home_stadium_lng=139.65389 WHERE id=294;   -- 川崎フロンターレ
UPDATE teams_master SET home_stadium_name='日産スタジアム',                      home_stadium_lat=35.50972, home_stadium_lng=139.60417 WHERE id=296;   -- 横浜F・マリノス
UPDATE teams_master SET home_stadium_name='岐阜メモリアルセンター長良川競技場',          home_stadium_lat=35.43528, home_stadium_lng=136.74778 WHERE id=297;   -- FC岐阜
UPDATE teams_master SET home_stadium_name='フクダ電子アリーナ',                    home_stadium_lat=35.59500, home_stadium_lng=140.11750 WHERE id=301;   -- ジェフユナイテッド千葉
UPDATE teams_master SET home_stadium_name='町田GIONスタジアム',                  home_stadium_lat=35.59083, home_stadium_lng=139.45611 WHERE id=303;   -- FC町田ゼルビア
UPDATE teams_master SET home_stadium_name='サンプロ アルウィン',                    home_stadium_lat=36.21639, home_stadium_lng=137.93444 WHERE id=304;   -- 松本山雅FC
UPDATE teams_master SET home_stadium_name='ケーズデンキスタジアム水戸',                home_stadium_lat=36.39028, home_stadium_lng=140.51861 WHERE id=305;   -- 水戸ホーリーホック
UPDATE teams_master SET home_stadium_name='味の素スタジアム',                     home_stadium_lat=35.66432, home_stadium_lng=139.52729 WHERE id=306;   -- 東京ヴェルディ
UPDATE teams_master SET home_stadium_name='ニッパツ三ツ沢球技場',                   home_stadium_lat=35.46194, home_stadium_lng=139.61472 WHERE id=307;   -- 横浜FC
UPDATE teams_master SET home_stadium_name='JIT リサイクルインクスタジアム',           home_stadium_lat=35.65806, home_stadium_lng=138.61750 WHERE id=308;   -- ヴァンフォーレ甲府
UPDATE teams_master SET home_stadium_name='NDソフトスタジアム山形',                home_stadium_lat=38.45972, home_stadium_lng=140.34361 WHERE id=312;   -- モンテディオ山形
UPDATE teams_master SET home_stadium_name='NACK5スタジアム大宮',                home_stadium_lat=35.90861, home_stadium_lng=139.62611 WHERE id=313;   -- ＲＢ大宮アルディージャ
UPDATE teams_master SET home_stadium_name='カンセキスタジアムとちぎ',                 home_stadium_lat=36.51389, home_stadium_lng=139.95361 WHERE id=315;   -- 栃木SC
UPDATE teams_master SET home_stadium_name='正田醤油スタジアム群馬',                  home_stadium_lat=36.35583, home_stadium_lng=139.04111 WHERE id=756;   -- ザスパ群馬
UPDATE teams_master SET home_stadium_name='ソユースタジアム',                      home_stadium_lat=39.71889, home_stadium_lng=140.10444 WHERE id=4315;  -- ブラウブリッツ秋田
UPDATE teams_master SET home_stadium_name='藤枝総合運動公園サッカー場',                home_stadium_lat=34.86056, home_stadium_lng=138.27278 WHERE id=4317;  -- 藤枝MYFC
UPDATE teams_master SET home_stadium_name='とうほう・みんなのスタジアム',              home_stadium_lat=37.71667, home_stadium_lng=140.42444 WHERE id=4318;  -- 福島ユナイテッドFC
UPDATE teams_master SET home_stadium_name='長野Uスタジアム',                     home_stadium_lat=36.65583, home_stadium_lng=138.21806 WHERE id=4323;  -- AC長野パルセイロ
UPDATE teams_master SET home_stadium_name='ギオンスタジアム',                      home_stadium_lat=35.55750, home_stadium_lng=139.36556 WHERE id=4324;  -- SC相模原
UPDATE teams_master SET home_stadium_name='プライフーズスタジアム',                  home_stadium_lat=40.55333, home_stadium_lng=141.46167 WHERE id=4326;  -- ヴァンラーレ八戸
UPDATE teams_master SET home_stadium_name='ハワイアンズスタジアムいわき',              home_stadium_lat=37.04528, home_stadium_lng=140.88472 WHERE id=7127;  -- いわきFC
UPDATE teams_master SET home_stadium_name='CITY FOOTBALL STATION',         home_stadium_lat=36.40222, home_stadium_lng=139.83361 WHERE id=7145;  -- 栃木シティ

-- ────────────── 西日本 (WEST / WEST-A / WEST-B) ──────────────
UPDATE teams_master SET home_stadium_name='エディオンピースウイング広島',            home_stadium_lat=34.39167, home_stadium_lng=132.45611 WHERE id=282;   -- サンフレッチェ広島
UPDATE teams_master SET home_stadium_name='IAIスタジアム日本平',                home_stadium_lat=34.96889, home_stadium_lng=138.42389 WHERE id=283;   -- 清水エスパルス
UPDATE teams_master SET home_stadium_name='ピーススタジアム',                    home_stadium_lat=32.75139, home_stadium_lng=129.86694 WHERE id=285;   -- V・ファーレン長崎
UPDATE teams_master SET home_stadium_name='豊田スタジアム',                      home_stadium_lat=35.08389, home_stadium_lng=137.17056 WHERE id=288;   -- 名古屋グランパス
UPDATE teams_master SET home_stadium_name='ノエビアスタジアム神戸',                 home_stadium_lat=34.65694, home_stadium_lng=135.16972 WHERE id=289;   -- ヴィッセル神戸
UPDATE teams_master SET home_stadium_name='ヨドコウ桜スタジアム',                   home_stadium_lat=34.61333, home_stadium_lng=135.51917 WHERE id=291;   -- セレッソ大阪
UPDATE teams_master SET home_stadium_name='パナソニックスタジアム吹田',              home_stadium_lat=34.80361, home_stadium_lng=135.53889 WHERE id=293;   -- ガンバ大阪
UPDATE teams_master SET home_stadium_name='駅前不動産スタジアム',                   home_stadium_lat=33.37944, home_stadium_lng=130.51778 WHERE id=295;   -- サガン鳥栖
UPDATE teams_master SET home_stadium_name='レゾナックドーム大分',                   home_stadium_lat=33.20139, home_stadium_lng=131.65778 WHERE id=298;   -- 大分トリニータ
UPDATE teams_master SET home_stadium_name='ポカリスエットスタジアム',                home_stadium_lat=34.18861, home_stadium_lng=134.62194 WHERE id=299;   -- 徳島ヴォルティス
UPDATE teams_master SET home_stadium_name='金沢ゴーゴーカレースタジアム',              home_stadium_lat=36.55028, home_stadium_lng=136.65694 WHERE id=300;   -- ツエーゲン金沢
UPDATE teams_master SET home_stadium_name='サンガスタジアム by KYOCERA',         home_stadium_lat=35.01389, home_stadium_lng=135.55750 WHERE id=302;   -- 京都サンガF.C.
UPDATE teams_master SET home_stadium_name='維新みらいふスタジアム',                  home_stadium_lat=34.16500, home_stadium_lng=131.46556 WHERE id=309;   -- レノファ山口FC
UPDATE teams_master SET home_stadium_name='JFE晴れの国スタジアム',                home_stadium_lat=34.67278, home_stadium_lng=133.94750 WHERE id=310;   -- ファジアーノ岡山
UPDATE teams_master SET home_stadium_name='デンカビッグスワンスタジアム',              home_stadium_lat=37.89167, home_stadium_lng=139.06667 WHERE id=311;   -- アルビレックス新潟
UPDATE teams_master SET home_stadium_name='えがお健康スタジアム',                   home_stadium_lat=32.78639, home_stadium_lng=130.74333 WHERE id=314;   -- ロアッソ熊本
UPDATE teams_master SET home_stadium_name='ベスト電器スタジアム',                   home_stadium_lat=33.62083, home_stadium_lng=130.45333 WHERE id=316;   -- アビスパ福岡
UPDATE teams_master SET home_stadium_name='ピカラスタジアム',                      home_stadium_lat=34.33639, home_stadium_lng=134.05028 WHERE id=317;   -- カマタマーレ讃岐
UPDATE teams_master SET home_stadium_name='ニンジニアスタジアム',                   home_stadium_lat=33.84583, home_stadium_lng=132.78972 WHERE id=318;   -- 愛媛FC
UPDATE teams_master SET home_stadium_name='ミクニワールドスタジアム北九州',             home_stadium_lat=33.89972, home_stadium_lng=130.87917 WHERE id=805;   -- ギラヴァンツ北九州
UPDATE teams_master SET home_stadium_name='タピック県総ひやごんスタジアム',             home_stadium_lat=26.21222, home_stadium_lng=127.69528 WHERE id=2235;  -- FC琉球
UPDATE teams_master SET home_stadium_name='白波スタジアム',                       home_stadium_lat=31.59333, home_stadium_lng=130.55444 WHERE id=2236;  -- 鹿児島ユナイテッドFC
UPDATE teams_master SET home_stadium_name='Axisバードスタジアム',                 home_stadium_lat=35.52639, home_stadium_lng=134.21528 WHERE id=4319;  -- ガイナーレ鳥取
UPDATE teams_master SET home_stadium_name='富山県総合運動公園陸上競技場',              home_stadium_lat=36.69056, home_stadium_lng=137.24389 WHERE id=4322;  -- カターレ富山
UPDATE teams_master SET home_stadium_name='野洲川歴史公園サッカー場',                home_stadium_lat=35.05611, home_stadium_lng=135.99889 WHERE id=7117;  -- レイラック滋賀FC
UPDATE teams_master SET home_stadium_name='高知県立春野総合運動公園球技場',             home_stadium_lat=33.49611, home_stadium_lng=133.50972 WHERE id=7129;  -- 高知ユナイテッドSC
UPDATE teams_master SET home_stadium_name='ロートフィールド奈良',                   home_stadium_lat=34.69333, home_stadium_lng=135.83000 WHERE id=7135;  -- 奈良クラブ
UPDATE teams_master SET home_stadium_name='花園ラグビー場',                      home_stadium_lat=34.66694, home_stadium_lng=135.62972 WHERE id=7138;  -- FC大阪
UPDATE teams_master SET home_stadium_name='アシックス里山スタジアム',                 home_stadium_lat=33.97056, home_stadium_lng=132.93667 WHERE id=10075; -- FC今治
UPDATE teams_master SET home_stadium_name='いちご宮崎新富サッカー場',                home_stadium_lat=32.08278, home_stadium_lng=131.50278 WHERE id=10409; -- テゲバジャーロ宮崎
