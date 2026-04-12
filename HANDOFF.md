# 引継ぎ資料 — jleakstats Fantasy 機能実装

作成日: 2026-04-07

---

## プロジェクト概要

- **サービス**: J.Leak Stats（Jリーグ統計サイト）
- **URL**: https://www.jleakstats.com
- **リポジトリ**: C:/Users/jackc/Desktop/jleakstats
- **フレームワーク**: Next.js 16.2.1（`middleware.js` → `proxy.js` にリネーム）
- **DB**: Neon PostgreSQL
- **認証**: Clerk（v7.0.8）

---

## 今セッションで完成した機能

### 1. Fantasy Transfer ページ (`app/fantasy/transfer/page.js`)
- 売却額カラムを削除
- 購入時価格（`bought_price`）と現在価格（`p.price`）を並べて表示（各80px、折り返しなし）
- 購入確認モーダル（残予算・獲得後予算を表示してから実行）
- 獲得候補タブに名前検索 + 移籍金フィルター（flex 6:4）
- 獲得不可の `+` ボタンにホバーでツールチップ（理由表示）
- 現スカッドのポジション名に「最低N人のため売却不可」注釈
- ポジション数ボックス：クラブカラー（充足分）/ `#666` （空き分）、accent色の縦区切り線

### 2. Fantasy Starters ページ (`app/fantasy/starters/page.js`)
- 同ポジション間でドラッグ＆ドロップによるスタメン入れ替え（スワップロジック）
- スタメン選手のクリックでベンチ落ちを無効化（クリックは選択のみ）
- 右パネルのスロット内選手もドラッグ可能に
- ポジションラベル: 白・12px
- 保存後: `localStorage.removeItem('fantasy_offsets')` → `window.location.href = '/fantasy'`（全員リセット）

### 3. Fantasy TOP ページ (`app/fantasy/page.js`)
- 選手カードを全面リデザイン:
  - クラブカラー背景の名前ボックス（幅は名前に合わせて可変）
  - 背番号を丸バッジ（クラブカラー）で名前ボックスの上中央に重ねる（`top: -16px`）
  - 名前ボックス直下に黒背景のポジションボックス（高さ16px, 文字#e7e7e7, 9px）
  - z-index: 名前ボックスが前面
- スタメン編集ボタン押下後、ページ遷移中にスピナー表示
- 未登録ユーザーのガード: `if (!user) router.push('/fantasy/setup')`
- スカッド0人の場合: `/fantasy/new_squad` へリダイレクト

### 4. カスタムサインインページ (`app/sign-in/[[...sign-in]]/page.js`)
- Clerk UIを使わず `useSignIn()` フックで完全オリジナル実装
- 2ステップ: メールアドレス入力 → 確認コード（OTP）
- `useAuth()` で既にサインイン済みの場合は `/fantasy` にリダイレクト
- `isLoaded` が false の間は LOADING... 表示

### 5. レイアウト (`app/layout.js`)
- `ClerkProvider` に darkテーマのカスタムappearanceを設定

---

## 現在の問題・未解決タスク

### 🔴 最重要: Clerk 認証フロー（本番環境）

**症状**: `https://www.jleakstats.com/fantasy` にアクセスすると LOADING... のまま進まない

**経緯**:
1. 最初 `export const proxy = clerkMiddleware(...)` → Vercel で "auth() was called but Clerk can't detect usage of clerkMiddleware()" エラー
2. Vercel に Clerk の env vars を追加（下記参照）
3. `middleware.js` が `proxy.js` と競合していた → `middleware.js` を削除
4. `export default clerkMiddleware(...)` に変更 → サインインページが LOADING... のまま

**現在の proxy.js（今セッション末に修正済み）**:
```js
const clerkHandler = clerkMiddleware(async (auth, request) => { ... })

export function proxy(request, event) {
  return clerkHandler(request, event)
}
```

**次のステップ**:
1. ローカルで `npm run dev` 起動
2. シークレットウィンドウで `localhost:3000/fantasy` にアクセス
3. ログインフロー（メール → OTP → setup → new_squad → fantasy）を確認
4. 問題なければ `git push` → Vercel 自動デプロイ

**Vercel に設定が必要な環境変数**（設定済みのはず）:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_Y2FwYWJsZS1xdWFpbC00Ny5jbGVyay5hY2NvdW50cy5kZXYk
CLERK_SECRET_KEY=sk_test_HWty287sumYioWPz7NogfNwWh60HzOVxq23jAx0S9i
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-in
DATABASE_URL=...（既存）
API_FOOTBALL_KEY=...（既存）
SITE_PASSWORD=jac
```

### 🟡 軽微: setup ページのエラー表示
`app/fantasy/setup/page.js` でエラー時に詳細なエラーメッセージが表示されている（`err?.message`）。
本番では汎用メッセージに変更推奨。

---

## ファイル構成（Fantasy関連）

```
app/
  fantasy/
    page.js            ← TOP（スカッド表示・選手カード）
    setup/page.js      ← 初回登録（監督名・クラブ名・カラー）
    new_squad/page.js  ← 初回スカッド編成
    transfer/page.js   ← 選手売買・獲得候補
    starters/page.js   ← スタメン設定（ドラッグ＆ドロップ）
  sign-in/
    [[...sign-in]]/page.js  ← カスタムサインインページ
  api/fantasy/
    me/route.js        ← ユーザー情報 GET/POST
    squad/route.js     ← スカッド取得
    starters/route.js  ← スタメン保存
    players/route.js   ← 選手一覧
    ...（他多数）
proxy.js               ← Clerk認証ミドルウェア（Next.js 16）
```

---

## 期待する正常フロー

```
未ログインユーザーが /fantasy にアクセス
  ↓ proxy.js の auth.protect() が発動
  ↓ /sign-in にリダイレクト
  ↓ メールアドレス入力 → OTPコード入力
  ↓ Clerk セッション確立
  ↓ /fantasy にリダイレクト
  ↓ fantasy_users テーブルにレコードがない → /fantasy/setup にリダイレクト
  ↓ 監督名・クラブ名・カラー設定
  ↓ /fantasy/new_squad にリダイレクト
  ↓ 初回スカッド15人編成
  ↓ /fantasy (TOP) へ
```

---

## git 現状

ブランチ: `main`

未コミットのファイル（主なもの）:
- `proxy.js` ← 今セッションで修正
- `app/fantasy/page.js`
- `app/fantasy/transfer/page.js`
- `app/fantasy/starters/page.js`
- `app/sign-in/[[...sign-in]]/page.js`（新規）
- `app/fantasy/setup/page.js`
- `app/layout.js`
- 各種 `app/api/fantasy/` ルート（新規）
- `app/fantasy/new_squad/`（新規）
