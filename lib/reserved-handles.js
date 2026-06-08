// URL ハンドルとして使用を禁止する予約語。
//   - ルーティング衝突や誤認の防止 (/admin などと紛らわしいハンドル)
//   - 公式・運営を騙るなりすましの防止
//   - clerk_user_id (user_ 始まり) との衝突防止 → resolveUser が handle 扱いしない
// 比較は小文字正規化後に行う前提。
const RESERVED = new Set([
  // トップレベルルート (app/ 直下)
  'admin', 'api', 'u', 'fixture', 'player', 'team', 'referee', 'standings',
  'search', 'rating', 'fantasy', 'fantype', 'notes', 'contact', 'privacy',
  'sign-in', 'sign-up', 'signin', 'signup', 'profile-setup', 'components',
  // 認証・システム系
  'user', 'users', 'me', 'settings', 'account', 'login', 'logout', 'auth',
  'callback', 'session', 'password', 'verify', 'new', 'edit', 'id',
  // なりすまし・公式詐称
  'official', 'support', 'help', 'staff', 'jleague', 'jleak', 'jleakstats',
  'root', 'moderator', 'mod', 'system', 'null', 'undefined', 'anonymous',
  'deleted', 'test', 'guest',
])

// handle が予約語なら true (大文字小文字は無視)。
export function isReservedHandle(handle) {
  const h = String(handle).trim().toLowerCase()
  if (RESERVED.has(h)) return true
  if (h.startsWith('user_')) return true // clerk_user_id と衝突するため不可
  return false
}
