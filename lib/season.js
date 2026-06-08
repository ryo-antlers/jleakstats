// ── 現在シーズン (単一ソース) ─────────────────────────────
// 新シーズンに切り替えるときは、この既定値を変えるか、環境変数 SEASON を設定する。
//   - コードで切替: 下の 2026 を新シーズン値に変更
//   - デプロイ無しで切替: 環境変数 SEASON=2027 (Vercel / cron-job.org / .env.local)
//
// 注意: API-Football の season も jleague.jp の year もこの値を使う。
//   26-27 シーズン (秋春制) では両者が「26-27」をどの数値で表すか要確認
//   (2026 か 2027 か)。確認後にこの値 or 環境変数を更新すること。
export const SEASON = Number(process.env.SEASON ?? 2026)

// J公式 (jleague.jp) の compYears コード。'<year>1' 形式 (例: 2026 → '20261')。
// 秋春制で形式が変わる可能性あり。要確認。
export const COMP_YEARS = `${SEASON}1`
