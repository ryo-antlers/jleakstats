/**
 * Phase 10.5: player_career_summary.team_id を埋める
 *
 * SFIX04 表記 (team_name_sfix) → teams_master.id へ自動マッピング + 手動マッピング。
 * 経歴タブのチーム名をリンク化するための前準備。
 *
 * Usage:
 *   node scripts/phase10_5_map_career_team_ids.mjs           # preview
 *   node scripts/phase10_5_map_career_team_ids.mjs --apply
 */

import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
dotenv.config({ path: "/Users/ryo/Desktop/jleakstats/.env.local" });
const sql = neon(process.env.DATABASE_URL);

const APPLY = process.argv.includes("--apply");

const teams = await sql`SELECT id, name_ja, short_name FROM teams_master`;

function normalize(s) {
  return s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

// 手動マッピング: SFIX04 表記 → short_name (teams_master を引く)
const MANUAL_BY_SHORT_NAME = {
  // 歴史的前身名 → 現クラブ
  "フジタ":  "湘南",
  "ヤマハ":  "磐田",
  "市原":    "千葉",
  "平塚":    "湘南",
  "草津":    "群馬",
  "B仙台":   "仙台",
  "Ｖ川崎":  "東京V",
  "横浜M":   "横浜FM",
  "岩手":    "盛岡",
  // U-23
  "Ｃ大23":  "C大阪U23",
  "Ｆ東23":  "F東京U23",
  "Ｇ大23":  "G大阪U23",
  "J-22":    "U-22選抜",
  // 全角揺れ
  "Ｆ東京":  "東京",
};

function resolveTeam(sfix) {
  // 手動辞書
  if (MANUAL_BY_SHORT_NAME[sfix]) {
    const target = MANUAL_BY_SHORT_NAME[sfix];
    return teams.find(t => t.short_name === target);
  }
  const sn = normalize(sfix);
  // 1. short_name 完全一致
  let hit = teams.find(t => t.short_name === sfix);
  if (hit) return hit;
  // 2. short_name 正規化一致
  hit = teams.find(t => t.short_name && normalize(t.short_name) === sn);
  if (hit) return hit;
  // 3. name_ja 完全一致
  hit = teams.find(t => t.name_ja === sfix);
  if (hit) return hit;
  // 4. name_ja に SFIX 表記が含まれる
  hit = teams.find(t => t.name_ja.includes(sfix) || t.name_ja.includes(sn));
  if (hit) return hit;
  return null;
}

const sfixNames = await sql`SELECT DISTINCT team_name_sfix FROM player_career_summary ORDER BY team_name_sfix`;
const mapping = [];
const unmatched = [];
for (const { team_name_sfix } of sfixNames) {
  const hit = resolveTeam(team_name_sfix);
  if (hit) mapping.push({ sfix: team_name_sfix, team_id: hit.id, team_name: hit.name_ja });
  else     unmatched.push({ sfix: team_name_sfix });
}

console.log(`=== Resolved: ${mapping.length}/${sfixNames.length} ===`);
if (unmatched.length) {
  console.log("\n=== Unmatched (will leave team_id NULL) ===");
  console.table(unmatched);
}

if (!APPLY) {
  console.log("\nDry-run only. Run with --apply to UPDATE.");
} else {
  console.log("\n=== APPLY ===");
  let totalUpdated = 0;
  for (const m of mapping) {
    const r = await sql`
      UPDATE player_career_summary
         SET team_id = ${m.team_id}
       WHERE team_name_sfix = ${m.sfix}
         AND (team_id IS NULL OR team_id <> ${m.team_id})
      RETURNING canonical_id
    `;
    totalUpdated += r.length;
  }
  console.log(`Total updated rows: ${totalUpdated}`);
  const [{ n: stillNull }] = await sql`SELECT COUNT(*)::int AS n FROM player_career_summary WHERE team_id IS NULL`;
  console.log(`Rows with team_id NULL after apply: ${stillNull}`);
}
