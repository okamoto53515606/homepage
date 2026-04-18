# v2 アプリ修正ポイント一覧

v1（Firebase / Firestore / GCS）→ v2（AWS: DynamoDB / S3 / Lambda）移行に伴う、
アプリケーションコード修正箇所の一覧。随時追記する。

> **凡例:** ✅ 完了 / 🔲 未着手 / 🔧 作業中

---

## 目次

0. [セットアップアプリ（Phase 0）](#0-セットアップアプリphase-0)
1. [コアライブラリ（P0）](#1-コアライブラリp0)
2. [認証 API（P1）](#2-認証-apip1)
3. [認証クライアント（P1）](#3-認証クライアントp1)
4. [管理画面 CRUD API（P2）](#4-管理画面-crud-apip2)
5. [公開 API（P2）](#5-公開-apip2)
6. [メディアアップロード（P2）](#6-メディアアップロードp2)
7. [Stripe 関連（P3）](#7-stripe-関連p3)
8. [設定・ミドルウェア（P3）](#8-設定ミドルウェアp3)
9. [AI / Genkit（P3）](#9-ai--genkitp3)
10. [横断的な変更](#10-横断的な変更)

---

## 0. セットアップアプリ（Phase 0）

本番アプリ（Next.js）とは**完全独立**のローカルセットアップアプリ（Next.js）。
本リポジトリ内の `setup/` ディレクトリに配置する。
AWS インフラの初期構築と管理者ユーザー作成を行う。
本アプリの修正（Phase 1〜5）はこの Phase 0 完了後に着手する。

> 設計詳細は `docs/blueprint_v2.md` のセットアップフローを参照。

### 0.1. Step 0 — AWS ルートキー入力画面 🔲

| 項目 | 内容 |
|------|------|
| 概要 | root ユーザーのアクセスキー・シークレットキーを入力する最小画面 |
| 保存先 | `.env` に `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` を書き込み |
| 備考 | root キーは Step 1a で IAM ユーザー作成後に無効化・削除する（一時利用のみ） |

### 0.2. Step 1a — CDK でインフラ構築 🔲

| 項目 | 内容 |
|------|------|
| 概要 | セットアップ画面から CDK を実行し、AWS リソースを作成 |
| 作成するリソース | IAM ユーザー（管理用）、Cognito ユーザープール（管理画面認証用） |
| `.env` 更新 | 作成した IAM ユーザーのキーで `.env` を上書き（root キーから切り替え） |
| CDK 追加先 | `cdk/lib/` に新スタックまたは既存スタックに追加 |

### 0.3. Step 1a — Cognito 管理ユーザー作成 🔲

| 項目 | 内容 |
|------|------|
| 概要 | セットアップ画面で管理者のメールアドレス・パスワードを入力し、Cognito にユーザーを作成 |
| 認証フロー | Cognito Hosted UI（リダイレクト方式。カスタムログイン画面は作らない） |
| 用途 | 管理画面（`/admin/*`）へのログインに使用 |
| 備考 | フロント（一般ユーザー）の Google OAuth 認証とは完全に独立 |

### 0.4. Phase 0 完了条件 🔲

| 条件 | 説明 |
|------|------|
| IAM ユーザーで AWS 操作可能 | root キーは無効化済み |
| Cognito ログイン成功 | 管理画面に Cognito 認証でアクセスできる |
| `.env` にIAM キー記載 | root キーから IAM キーに切り替え済み |

---

## 1. コアライブラリ（P0）

基盤ライブラリの置き換え。他の全ファイルがこれに依存するため最優先。
Phase 0 完了後（Cognito 認証基盤が整った状態）に着手する。

### 1.1. `src/lib/firebase-admin.ts` → DynamoDB クライアント 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `firebase-admin/app`, `firebase-admin/firestore`, `firebase-admin/auth` をインポート。`getAdminDb()`, `getAdminAuth()` をエクスポート |
| 変更 | 新規 `src/lib/dynamodb.ts` を作成し、DynamoDB Document Client をエクスポート。firebase-admin.ts は認証移行後に削除 |
| 備考 | `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` を使用 |

### 1.2. `src/lib/firebase.ts` → クライアント SDK 除去 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `firebase/app`, `firebase/auth`, `firebase/storage` をインポート。`auth`, `storage` をエクスポート |
| 変更 | `auth` → Google OAuth 直接フロー（`auth-provider.tsx` 側で対応）。`storage` → S3 presigned URL アップロードに変更。最終的にファイル削除 |
| 備考 | `NEXT_PUBLIC_FIREBASE_*` 環境変数も全て不要になる |

### 1.3. `src/lib/auth.ts` — セッション検証 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `getAdminAuth()` で `verifySessionCookie()`、`getAdminDb()` で users コレクション参照 |
| 変更 | カスタム JWT 検証に変更。ユーザー取得は DynamoDB `homepage-users` テーブルから `GetItem` |
| uid 変更 | ユーザー識別子を `uid`（Firebase Auth UID）→ `google_uid` に変更 |

### 1.4. `src/lib/data.ts` — 記事・コメント取得 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `getAdminDb()` で articles / comments コレクションを `orderBy`, `where`, `limit`, `startAfter` 等で取得 |
| 変更 | 全クエリを DynamoDB API（`Query`, `Scan`, `GetItem`, `BatchGetItem`）に書き換え |
| ソート順変更 | `orderBy('updatedAt', 'desc')` → `createdAt` 降順に変更 |
| ページネーション | v1 の offset-based → v2 で cursor-based（`ExclusiveStartKey`）に変更 |
| タグ絞り込み | `article_tags` テーブルから記事IDリスト取得 → `BatchGetItem` で記事本体取得 |

### 1.5. `src/lib/settings.ts` — サイト設定取得 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `getAdminDb()` で `settings/site_config` ドキュメントを読み取り |
| 変更 | DynamoDB `homepage-settings` テーブルから `GetItem`（PK: `site_config`） |

### 1.6. `src/lib/user-access-admin.ts` — アクセス権管理 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `getAdminDb()` で users / payments コレクションを読み書き。`Timestamp`, `FieldValue` 使用 |
| 変更 | DynamoDB `homepage-users` / `homepage-payments` テーブルの `GetItem` / `UpdateItem` / `PutItem` に変更 |
| uid 変更 | `user_id` を `google_uid` ベースに変更 |

### 1.7. `src/lib/stripe.ts` — Stripe 初期化 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `process.env.STRIPE_SECRET_KEY` で Stripe クライアント初期化 |
| 変更 | Secrets Manager（`homepage/stripe-config`）から取得に変更。キャッシュ付き |
| 備考 | Stripe SDK 自体はそのまま使用 |

### 1.8. `src/lib/env.ts` — 環境変数ヘルパー 🔲

| 項目 | 内容 |
|------|------|
| 現状 | Firebase App Hosting の `x-fah-client-ip` ヘッダーを参照 |
| 変更 | Lambda / CloudFront ヘッダー（`X-Forwarded-For` 等）に変更 |

---

## 2. 認証 API（P1）

### 2.1. `src/app/api/auth/session/route.ts` 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `verifyIdToken()` → `createSessionCookie()` → Firestore に users upsert |
| 変更 | Google OAuth トークン検証 → カスタム JWT 発行 → DynamoDB `homepage-users` に upsert |
| uid 変更 | PK を `google_uid` に変更、旧 `uid` フィールドの書き込み削除 |

### 2.2. `src/app/api/auth/withdraw/route.ts` 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `verifySessionCookie()` → `deleteUser()` → Firestore batch（comments 更新 + users 削除） |
| 変更 | JWT 検証 → DynamoDB batch write（comments 更新 + users 削除）。Firebase Auth `deleteUser()` は不要に |

### 2.3. `src/app/api/auth/me/route.ts` 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `getUser()` を呼び出し |
| 変更 | `auth.ts` の移行で自動的に対応される（間接依存） |

---

## 3. 認証クライアント（P1）

### 3.1. `src/components/auth/auth-provider.tsx` 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `firebase/auth` の `signInWithCredential`, `GoogleAuthProvider`, `onAuthStateChanged` を使用 |
| 変更 | Google OAuth 直接フロー（既に部分実装済み）。Firebase Auth SDK 依存を完全除去。カスタム認証状態管理 |

### 3.2. `src/app/withdraw/withdraw-client.tsx` 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `firebase/auth` の `firebaseSignOut` を使用 |
| 変更 | カスタムサインアウト（セッション Cookie クリア + API 呼び出し） |

---

## 4. 管理画面 CRUD API（P2）

### 4.1. `src/app/api/admin/articles/route.ts` — 記事削除 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `db.collection('articles').doc(id).delete()` |
| 変更 | DynamoDB `DeleteItem` + `article_tags` の該当エントリも削除 |

### 4.2. `src/app/api/admin/articles/[id]/route.ts` — 記事更新・取得 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `db.collection('articles').doc(id).update()` / `.get()` |
| 変更 | DynamoDB `UpdateItem` / `GetItem`。タグ変更時は `article_tags` の差分更新（TransactWriteItems） |

### 4.3. `src/app/api/admin/articles/generate/route.ts` — 記事生成 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `db.collection('articles').select('tags').get()` → `articlesRef.add()` |
| 変更 | DynamoDB `Scan`（タグ一覧取得）→ `PutItem`（新規記事）+ `article_tags` への書き込み |
| 削除フィールド | `teaserContent`, `generationPrompt` の書き込みを削除 |

### 4.4. `src/app/api/admin/articles/[id]/revise/route.ts` — 記事改訂 🔲

| 項目 | 内容 |
|------|------|
| 現状 | 全タグ読み取り + 単一記事の読み取り・更新 |
| 変更 | DynamoDB 操作に置き換え |
| 削除フィールド | `teaserContent` の書き込みを削除 |

### 4.5. `src/app/admin/articles/edit/[id]/page.tsx` — 記事編集ページ 🔲

| 項目 | 内容 |
|------|------|
| 現状 | サーバーコンポーネントで `getAdminDb()` → 記事ドキュメント直接読み取り |
| 変更 | DynamoDB `GetItem` |

### 4.6. `src/app/api/admin/settings/route.ts` — 設定更新 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `db.collection('settings').doc('site_config').set()` |
| 変更 | DynamoDB `PutItem` |

### 4.7. `src/app/api/admin/comments/route.ts` — コメント削除 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `db.collection('comments').doc(id).delete()` |
| 変更 | DynamoDB `DeleteItem` |

### 4.8. Stripe 管理画面 API（新規）🔲

| 項目 | 内容 |
|------|------|
| 新規 | `POST /api/admin/stripe-config` — Secrets Manager の read/write エンドポイント |
| 新規 | Stripe 設定の入力・表示画面 |

### 4.9. Google OAuth 管理画面 API（新規）🔲

| 項目 | 内容 |
|------|------|
| 新規 | `POST /api/admin/google-oauth-config` — Secrets Manager の read/write エンドポイント |
| 新規 | Google OAuth 設定の入力・表示画面（`NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`） |
| 保存先 | 本番: Secrets Manager、ローカル開発: `.env` を参照 |

---

## 5. 公開 API（P2）

### 5.1. `src/app/api/articles/[slug]/comments/route.ts` 🔲

| 項目 | 内容 |
|------|------|
| 現状 | slug で記事取得 → comments コレクション読み書き |
| 変更 | DynamoDB `Query`（GSI slug-index）→ `homepage-comments` テーブルの `Query` / `PutItem` |
| uid 変更 | コメント投稿時の `userId` を `google_uid` で設定 |

### 5.2. `src/app/api/articles/[slug]/content/route.ts` 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `getArticleBySlug()` を呼び出し |
| 変更 | `data.ts` の移行で自動対応（間接依存） |

---

## 6. メディアアップロード（P2）

### 6.1. `src/app/admin/articles/new/article-generator-form.tsx` 🔲

| 項目 | 内容 |
|------|------|
| 現状 | Firebase Storage の `ref()` + `uploadBytes()` で GCS にアップロード。URL を `https://storage.googleapis.com/${bucket}/${filePath}` で構築 |
| 変更 | S3 presigned URL アップロードに変更。URL パターンを `{BASE_URL}/media/articles/{uid}/{file}` に変更 |
| 関連 | 新規 API `POST /api/admin/upload` — presigned URL 発行エンドポイントが必要 |

### 6.2. メディア URL 書き換え用の新規 API 🔲

| 項目 | 内容 |
|------|------|
| 新規 | presigned URL 発行 API：`POST /api/admin/upload` → S3 putObject presigned URL を返す |
| 備考 | 詳細は `docs/s3-migration_v2.md` を参照 |

---

## 7. Stripe 関連（P3）

Stripe SDK はそのまま使用。環境変数の取得元を変更する。

### 7.1. `src/lib/stripe.ts` 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `process.env.STRIPE_SECRET_KEY` |
| 変更 | AWS Secrets Manager（`homepage/stripe-config`）から取得。キャッシュ付き |

### 7.2. `src/app/api/stripe/checkout/route.ts` 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `STRIPE_SECRET_KEY`, `STRIPE_TAX_RATES`, `STRIPE_TERMS_OF_SERVICE_ENABLED` を直接参照 |
| 変更 | Secrets Manager 経由に変更 |
| uid 変更 | `client_reference_id` / `metadata.userId` を `google_uid` で設定 |

### 7.3. `src/app/api/stripe/webhook/route.ts` 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `STRIPE_WEBHOOK_SECRET` を直接参照。`user-access-admin.ts` を経由で Firestore 書き込み |
| 変更 | Secrets Manager 経由。`user-access-admin.ts` は DynamoDB 版を使用 |
| uid 変更 | `user_id` を `google_uid` で設定 |

### 7.4. `src/app/api/stripe/config/route.ts` 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `getDynamicPaymentConfig()` → settings 読み取り |
| 変更 | `settings.ts` の移行で自動対応 |

### 7.5. `src/app/api/stripe/session/route.ts` 🔲

| 項目 | 内容 |
|------|------|
| 現状 | Stripe SDK のみ使用（Firestore 依存なし） |
| 変更 | 変更不要（Secrets Manager 化後も影響なし） |

---

## 8. 設定・ミドルウェア（P3）

### 8.1. `next.config.ts` — CSP ・画像設定 🔲

| 項目 | 内容 |
|------|------|
| `images.remotePatterns` | **削除**。画像は同一ドメイン（CloudFront / 独自ドメイン）の `/media/*` から相対パスで参照するため不要 |
| 外部ドメインの画像 | Next.js `<Image>` ではなく通常の `<img>` タグで参照（Next.js 最適化なし） |
| CSP `img-src` | `*.googleapis.com` を除去 |
| CSP `connect-src` | Firebase Auth 関連ドメインを除去 |

### 8.2. `src/middleware.ts` — IP 取得ヘッダー 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `x-fah-client-ip`（Firebase App Hosting 固有ヘッダー）を参照 |
| 変更 | `CloudFront-Viewer-Address`（CloudFront / Lambda Web Adapter）に変更 |

---

## 9. AI / Genkit（P3）

### 9.1. `src/ai/flows/generate-article-draft.ts` 🔲

| 項目 | 内容 |
|------|------|
| 現状 | プロンプト内で GCS URL パターン（`https://storage.googleapis.com/...`）を参照 |
| 変更 | 新 URL パターン（`{BASE_URL}/media/articles/{uid}/{file}`）に変更 |
| 削除フィールド | `teaserContent` の生成を削除 |

### 9.2. `src/ai/flows/revise-article-draft.ts` 🔲

| 項目 | 内容 |
|------|------|
| 削除フィールド | `teaserContent` の生成を削除 |

### 9.3. `src/ai/genkit.ts` 🔲

| 項目 | 内容 |
|------|------|
| 現状 | Genkit + Google AI。Firebase 依存なし |
| 変更 | 変更不要 |

---

## 10. 横断的な変更

### 10.1. `article_tags` テーブルの同期ロジック 🔲

articles テーブルの CRUD 操作時に `article_tags` テーブルの整合性を維持する。

| 操作 | 必要な同期 |
|------|-----------|
| 記事作成 | `article_tags` にエントリを追加 |
| 記事更新（タグ変更時） | 旧タグ削除 + 新タグ追加（`TransactWriteItems`） |
| 記事削除 | `article_tags` の該当エントリを削除 |

### 10.2. ページネーション方式の変更 🔲

| 項目 | 内容 |
|------|------|
| 現状 | offset-based（`startAfter(lastDoc)`） |
| 変更 | cursor-based（`ExclusiveStartKey`） |
| 影響ファイル | `src/lib/data.ts`, `src/components/pagination.tsx`, `src/app/page.tsx`, `src/app/tags/[tag]/page.tsx`, `src/app/admin/articles/page.tsx` |

### 10.3. 記事ソート順の変更 🔲

| 項目 | 内容 |
|------|------|
| 現状 | `orderBy('updatedAt', 'desc')` |
| 変更 | `createdAt` 降順（DynamoDB GSI `status-createdAt-index` を使用） |
| 影響ファイル | `src/lib/data.ts`, `src/components/article-card.tsx`（表示ラベル「最終更新日」→「公開日」）, `src/app/articles/[slug]/page.tsx` |

### 10.4. `uid` → `google_uid` 識別子変更 🔲

Firebase Auth UID から Google OAuth sub ID への変更。

| 影響ファイル | 内容 |
|-------------|------|
| `src/lib/auth.ts` | ユーザー識別子を変更 |
| `src/app/api/auth/session/route.ts` | PK を `google_uid` に変更 |
| `src/app/api/articles/[slug]/comments/route.ts` | `userId` を `google_uid` で設定 |
| `src/app/api/stripe/webhook/route.ts` | `user_id` を `google_uid` で設定 |
| `src/app/api/stripe/checkout/route.ts` | `client_reference_id` を `google_uid` で設定 |
| `src/lib/user-access-admin.ts` | `google_uid` ベースに変更 |
| `src/app/api/auth/withdraw/route.ts` | ユーザー参照を `google_uid` に変更 |

### 10.5. 環境変数の整理 🔲

| 削除する環境変数 | 理由 |
|-----------------|------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase 不使用 |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase 不使用 |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase 不使用 |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | S3 に移行 |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase 不使用 |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase 不使用 |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | AWS IAM に移行 |
| `STRIPE_SECRET_KEY` | Secrets Manager に移行 |
| `STRIPE_WEBHOOK_SECRET` | Secrets Manager に移行 |

| 追加する環境変数 | 用途 |
|-----------------|------|
| `AWS_REGION` | DynamoDB / S3 リージョン |
| `MEDIA_BASE_URL` | メディア URL のベース（CloudFront or 独自ドメイン） |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth（既存） |

### 10.6. ページコンポーネント（間接依存）🔲

以下はコアライブラリ移行で自動的に対応される。直接の変更は不要。

| ファイル | 依存先 |
|---------|--------|
| `src/app/page.tsx` | `data.ts`, `settings.ts` |
| `src/app/articles/[slug]/page.tsx` | `data.ts`, `settings.ts` |
| `src/app/tags/[tag]/page.tsx` | `data.ts`, `settings.ts` |
| `src/app/layout.tsx` | `settings.ts` |
| `src/app/admin/layout.tsx` | `auth.ts` |
| `src/app/admin/articles/page.tsx` | `data.ts` |
| `src/app/admin/comments/page.tsx` | `data.ts` |
| `src/app/admin/settings/page.tsx` | `settings.ts` |
| `src/app/withdraw/page.tsx` | `auth.ts`, `settings.ts` |
| `src/app/legal/*/page.tsx` | `settings.ts` |
| `src/components/paywall.tsx` | `auth.ts`, `settings.ts`, `stripe.ts` |
| `src/components/header.tsx` | `data.ts`, `settings.ts` |
| `src/components/footer.tsx` | `settings.ts` |

### 10.7. 削除対象ファイル 🔲

移行完了後に削除するファイル。

| ファイル | 理由 |
|---------|------|
| `src/lib/firebase-admin.ts` | DynamoDB に置き換え |
| `src/lib/firebase.ts` | Firebase クライアント SDK 不使用 |
| `firebase.json` | Firebase 不使用 |
| `firestore.rules` | Firestore 不使用 |
| `firestore.indexes.json` | Firestore 不使用 |
| `storage.rules` | Firebase Storage 不使用 |
| `storage-cors-example.json` | Firebase Storage 不使用 |
| `apphosting.yaml` | Firebase App Hosting 不使用 |

---

---

## 引継ぎメモ

### 2026/04/18 — データ移行・インフラ構築 完了

**完了済み作業（アプリコード修正の前提となるインフラ）:**

| 作業 | 状態 | 備考 |
|------|------|------|
| CDK スタック（DynamoDB 6 テーブル + 5 GSI） | ✅ | `cdk/lib/dynamodb-stack.ts` |
| CDK スタック（S3 バケット + CloudFront） | ✅ | 同上 |
| Firestore → DynamoDB データ移行 | ✅ | 全 6 テーブル + Secrets Manager |
| GCS → S3 ファイルコピー | ✅ | 172 ファイル、14.3 MB |
| DynamoDB 内の記事 URL 書き換え | ✅ | 24 記事、278 URL |

**インフラ構成（現在）:**

| リソース | 値 |
|---------|-----|
| CloudFront ドメイン | `d2fji8p4s4t0zd.cloudfront.net`（ID: `E1J0TZZ879DNCH`） |
| S3 バケット | `homepage-media-210387976006`（ap-northeast-1） |
| S3 キー構造 | `media/articles/{uid}/{file}`（**`articles/` ではなく `media/articles/`**） |
| CloudFront → S3 | OAC 経由、CloudFront Function なし（URL パス = S3 キー） |
| AWS プロファイル | `okamo`（アカウント `210387976006`） |

**アーキテクチャ方針（決定済み）:**

- CloudFront は **1 ディストリビューション** で運用。将来 Lambda 追加時は:
  - `/media/*` → S3（additionalBehaviors）
  - `/*` → Lambda Function URL（defaultBehavior）
- 管理画面（`/admin/*`）は **別 Next.js アプリにしない**。1 アプリ内で middleware による認証分岐（Cognito / Google OAuth）

**関連スクリプト:**

| スクリプト | 用途 |
|-----------|------|
| `cli/migration_gcs_to_s3.ts` | GCS → S3 コピー（S3 キーに `media/` プレフィックス付与） |
| `cli/migration_rewrite_media_urls.ts` | DynamoDB 内 URL 書き換え（`--old-base` で再書き換え可能） |

---

## 修正の推奨順序

```
Phase 0: セットアップアプリ（`setup/` ディレクトリの独立 Next.js アプリ）
  0.1  Step 0 — root アクセスキー入力画面
  0.2  Step 1a — CDK 実行（IAM ユーザー + Cognito ユーザープール作成）
  0.3  Step 1a — Cognito 管理ユーザー作成
  → 管理者が Cognito でログインできる状態。root キーは無効化済み

Phase 1: コアライブラリ（P0）
  1.1  dynamodb.ts 新規作成
  1.4  data.ts（記事取得 — 画面表示の基本）
  1.5  settings.ts（サイト設定）
  → この時点でトップページ・記事一覧が DynamoDB で動作

Phase 2: 認証（P1）
  1.3  auth.ts
  2.1  session/route.ts
  3.1  auth-provider.tsx
  → ログイン・セッション管理が AWS ベースに
  ※ 管理画面認証は Cognito（Phase 0 で構築済み）
  ※ フロント認証は Google OAuth（ここで実装）

Phase 3: 管理画面 + 公開 API（P2）
  4.1〜4.7  admin API routes
  4.8       Stripe 管理画面 API
  4.9       Google OAuth 管理画面 API
  5.1〜5.2  public API routes
  6.1       メディアアップロード
  → 管理画面の CRUD が DynamoDB で動作

Phase 4: Stripe + 設定（P3）
  7.1〜7.3  Stripe 環境変数の Secrets Manager 化
  8.1〜8.2  next.config.ts, middleware.ts
  9.1〜9.2  AI プロンプト更新

Phase 5: クリーンアップ
  10.5  環境変数整理
  10.7  不要ファイル削除
```
