-- ========================================
-- J.Leak Stats - テーブル作成SQL
-- Neon SQL Editorで実行してください
-- ========================================

-- マスターテーブル

CREATE TABLE IF NOT EXISTS teams_master (
  id INTEGER PRIMARY KEY,
  name_en TEXT,
  name_ja TEXT,
  short_name TEXT,
  color_primary TEXT,
  color_secondary TEXT,
  group_name TEXT,
  motif TEXT
);

CREATE TABLE IF NOT EXISTS players_master (
  id INTEGER PRIMARY KEY,
  name_en TEXT,
  name_ja TEXT,
  team_id INTEGER,
  position TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS venues_master (
  id INTEGER PRIMARY KEY,
  name_en TEXT,
  name_ja TEXT,
  city_ja TEXT,
  capacity INTEGER
);

CREATE TABLE IF NOT EXISTS referees_master (
  name_en TEXT PRIMARY KEY,
  name_ja TEXT
);

-- データテーブル

CREATE TABLE IF NOT EXISTS fixtures (
  id INTEGER PRIMARY KEY,
  league_id INTEGER DEFAULT 98,
  season INTEGER DEFAULT 2026,
  round TEXT,
  round_number INTEGER,
  date TIMESTAMPTZ,
  referee_en TEXT,
  venue_id INTEGER,
  home_team_id INTEGER,
  away_team_id INTEGER,
  home_score INTEGER,
  away_score INTEGER,
  home_score_ht INTEGER,
  away_score_ht INTEGER,
  home_penalty INTEGER,
  away_penalty INTEGER,
  status TEXT,
  elapsed INTEGER,
  winner TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fixture_statistics (
  fixture_id INTEGER,
  team_id INTEGER,
  shots_on INTEGER,
  shots_off INTEGER,
  shots_total INTEGER,
  shots_blocked INTEGER,
  shots_inside INTEGER,
  shots_outside INTEGER,
  fouls INTEGER,
  corners INTEGER,
  offsides INTEGER,
  possession TEXT,
  yellow_cards INTEGER,
  red_cards INTEGER,
  saves INTEGER,
  passes_total INTEGER,
  passes_accurate INTEGER,
  passes_pct TEXT,
  expected_goals DECIMAL(4,2),
  PRIMARY KEY (fixture_id, team_id)
);

CREATE TABLE IF NOT EXISTS fixture_events (
  id SERIAL PRIMARY KEY,
  fixture_id INTEGER,
  elapsed INTEGER,
  team_id INTEGER,
  player_id INTEGER,
  player_name_en TEXT,
  assist_id INTEGER,
  assist_name_en TEXT,
  type TEXT,
  detail TEXT
);

CREATE TABLE IF NOT EXISTS fixture_lineups (
  id SERIAL PRIMARY KEY,
  fixture_id INTEGER,
  team_id INTEGER,
  coach_name TEXT,
  formation TEXT,
  player_id INTEGER,
  player_name_en TEXT,
  number INTEGER,
  position TEXT,
  grid TEXT,
  is_starter BOOLEAN
);

CREATE TABLE IF NOT EXISTS fixture_player_stats (
  fixture_id INTEGER,
  team_id INTEGER,
  player_id INTEGER,
  minutes INTEGER,
  number INTEGER,
  position TEXT,
  rating DECIMAL(3,1),
  is_captain BOOLEAN,
  is_substitute BOOLEAN,
  shots_total INTEGER,
  shots_on INTEGER,
  goals INTEGER,
  assists INTEGER,
  saves INTEGER,
  conceded INTEGER,
  passes_total INTEGER,
  passes_key INTEGER,
  passes_accuracy TEXT,
  tackles INTEGER,
  blocks INTEGER,
  interceptions INTEGER,
  duels_total INTEGER,
  duels_won INTEGER,
  dribbles_attempts INTEGER,
  dribbles_success INTEGER,
  fouls_drawn INTEGER,
  fouls_committed INTEGER,
  yellow_cards INTEGER,
  red_cards INTEGER,
  PRIMARY KEY (fixture_id, player_id)
);

CREATE TABLE IF NOT EXISTS fixture_odds (
  id SERIAL PRIMARY KEY,
  fixture_id INTEGER,
  bookmaker_id INTEGER,
  bookmaker_name TEXT,
  bet_id INTEGER,
  bet_name TEXT,
  value TEXT,
  odd DECIMAL(6,2),
  UNIQUE (fixture_id, bookmaker_id, bet_id, value)
);

CREATE TABLE IF NOT EXISTS player_season_stats (
  player_id INTEGER,
  season INTEGER,
  team_id INTEGER,
  appearances INTEGER,
  lineups INTEGER,
  minutes INTEGER,
  rating DECIMAL(3,1),
  goals INTEGER,
  assists INTEGER,
  shots_total INTEGER,
  shots_on INTEGER,
  passes_total INTEGER,
  passes_key INTEGER,
  passes_accuracy TEXT,
  tackles INTEGER,
  blocks INTEGER,
  interceptions INTEGER,
  yellow_cards INTEGER,
  red_cards INTEGER,
  PRIMARY KEY (player_id, season, team_id)
);

-- ========================================
-- teams_master 初期データ投入
-- ========================================

INSERT INTO teams_master VALUES
(290, 'Kashima',             '鹿島アントラーズ',       '鹿島',   '#003087', '#cc0000', 'EAST', '🦌'),
(281, 'Kashiwa Reysol',      '柏レイソル',             '柏',     '#ffdd00', '#000000', 'EAST', '☀️'),
(287, 'Urawa',               '浦和レッズ',             '浦和',   '#cc0000', '#000000', 'EAST', '🔥'),
(292, 'FC Tokyo',            'FC東京',                 '東京',   '#003087', '#cc0000', 'EAST', '🗼'),
(294, 'Kawasaki Frontale',   '川崎フロンターレ',       '川崎',   '#0066cc', '#000000', 'EAST', '🏭'),
(296, 'Yokohama F. Marinos', '横浜F・マリノス',       '横浜FM', '#003087', '#cc0000', 'EAST', '⚓'),
(303, 'Machida Zelvia',      'FC町田ゼルビア',         '町田',   '#006633', '#000000', 'EAST', '🛡️'),
(305, 'Mito Hollyhock',      '水戸ホーリーホック',     '水戸',   '#003087', '#ffffff', 'EAST', '🌺'),
(306, 'Tokyo Verdy',         '東京ヴェルディ',         '東京V',  '#006633', '#000000', 'EAST', '🌿'),
(301, 'JEF United Chiba',    'ジェフユナイテッド千葉', '千葉',   '#ffdd00', '#ff6600', 'EAST', '🐼'),
(282, 'Sanfrecce Hiroshima', 'サンフレッチェ広島',     '広島',   '#660099', '#000000', 'WEST', '🏹'),
(283, 'Shimizu S-pulse',     '清水エスパルス',         '清水',   '#ff6600', '#000000', 'WEST', '🍊'),
(285, 'V-varen Nagasaki',    'V・ファーレン長崎',      '長崎',   '#003087', '#cc0000', 'WEST', '⛵'),
(288, 'Nagoya Grampus',      '名古屋グランパス',       '名古屋', '#cc0000', '#000000', 'WEST', '🐉'),
(289, 'Vissel Kobe',         'ヴィッセル神戸',         '神戸',   '#cc0000', '#000000', 'WEST', '⚓'),
(291, 'Cerezo Osaka',        'セレッソ大阪',           'C大阪',  '#ff69b4', '#000000', 'WEST', '🌸'),
(293, 'Gamba Osaka',         'ガンバ大阪',             'G大阪',  '#003087', '#000000', 'WEST', '🐘'),
(302, 'Kyoto Sanga',         '京都サンガF.C.',         '京都',   '#660099', '#cc0000', 'WEST', '🏯'),
(310, 'Fagiano Okayama',     'ファジアーノ岡山',       '岡山',   '#003087', '#cc0000', 'WEST', '🦚'),
(316, 'Avispa Fukuoka',      'アビスパ福岡',           '福岡',   '#003087', '#cc0000', 'WEST', '🐝')
ON CONFLICT (id) DO NOTHING;
