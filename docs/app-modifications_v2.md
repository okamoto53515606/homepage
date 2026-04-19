# v2 アプリ修正ポイント一覧

v1（Firebase / Firestore / GCS）→ v2（AWS: DynamoDB / S3 / Lambda）移行に伴う、
アプリケーションコード修正箇所の一覧。随時追記する。

2026/4/20  okamo追記: 以下は不要。管理画面は別認証。
          {user.role === 'admin' && (
            <Link 
              href="/admin"
              className="dropdown__item"
              onClick={() => setIsMenuOpen(false)}
            >
              <Settings size={16} style={{marginRight: '8px'}} />
              管理画面
            </Link>
          )}

> **凡例:** ✅ 完了 / 🔲 未着手 / 🔧 作業中

> **コーディング方針:** v2 は AWS 前提のため、他環境を考慮したフォールバック処理は不要。
> 例: `CloudFront-Viewer-Address` が取得できない場合に `x-forwarded-for` へフォールバックする処理は脆弱性の原因になるため行わない。IP が取れない場合は `0.0.0.0` を使用する。

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

### 0.0. セットアップアプリの技術構成 ✅

| 項目 | 内容 |
|------|------|
| フレームワーク | Next.js 16 (App Router)、独立 `setup/` ディレクトリ |
| ポート | `localhost:3001`（本体アプリと別ポート） |
| スタイル | Tailwind CSS v4 |
| 状態管理 | `setup/setup-state.json`（JSON ファイル。詳細は `blueprint_v2.md` 参照） |
| 設定値管理 | 親ディレクトリの `.env` を読み書き（`setup/src/lib/env.ts`） |
| UI 構成 | 左サイドバー（フェーズ一覧 + 進捗表示）+ メインコンテンツ |

**ディレクトリ構成:**
```
setup/
├── setup-state.json          # セットアップ進捗（.gitignore 対象）
├── src/
│   ├── app/
│   │   ├── layout.tsx        # Sidebar + メインコンテンツの flex レイアウト
│   │   ├── page.tsx          # ルート — currentPhase にリダイレクト
│   │   ├── setup0/page.tsx   # AWS キー入力
│   │   ├── setup1a/page.tsx  # CDK デプロイ + Cognito ユーザー作成
│   │   ├── setup1b/page.tsx  # サイト公開（未実装）
│   │   ├── setup1c/page.tsx  # Google OAuth 案内（homepage管理画面で設定）
│   │   ├── setup1c-iam/      # IAM ユーザー作成（未実装）
│   │   ├── setup2a/page.tsx  # Stripe サンドボックス案内（homepage管理画面で設定）
│   │   ├── setup2b/page.tsx  # 独自ドメイン（未実装）
│   │   ├── setup3/page.tsx   # Stripe 本番化案内（homepage管理画面で設定）
│   │   └── api/
│   │       ├── aws-key/      # POST: AWS キー保存 + STS テスト
│   │       ├── cdk-deploy/   # POST: CDK bootstrap + deploy
│   │       ├── cognito-user/ # POST: Cognito AdminCreateUser
│   │       ├── cognito-users/# GET: Cognito ListUsers（一覧取得）
│   │       ├── cognito-info/ # GET: Cognito 設定情報（Hosted UI URL 構築用）
│   │       └── status/       # GET: setup-state.json の内容を返す
│   ├── components/
│   │   ├── sidebar.tsx       # 左サイドバー（フェーズ進捗表示）
│   │   ├── step0-aws-key.tsx # AWS キー入力フォーム
│   │   ├── step1a-cdk.tsx    # CDK デプロイ実行 UI
│   │   └── step1a-cognito-user.tsx  # ユーザー作成 + 一覧 + 2FA 案内
│   └── lib/
│       ├── env.ts            # .env 読み書きユーティリティ
│       └── setup-state.ts    # setup-state.json 管理（型定義 + CRUD 関数）
```

### 0.1. Step 0 — AWS ルートキー入力画面 ✅

| 項目 | 内容 |
|------|------|
| 概要 | root ユーザーのアクセスキー・シークレットキーを入力し、STS `GetCallerIdentity` で接続テスト |
| 保存先 | `.env` に `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` を書き込み |
| 実装 | `setup/src/components/step0-aws-key.tsx` + `setup/src/app/api/aws-key/route.ts` |
| 備考 | 成功後に setup-state.json の setup0 を completed にし、setup1a に遷移 |

### 0.2. Step 1a — CDK デプロイ（CognitoStack） ✅

| 項目 | 内容 |
|------|------|
| 概要 | セットアップ画面から `npx cdk bootstrap` + `npx cdk deploy --all` を実行 |
| 作成するリソース | Cognito User Pool（MFA 必須、TOTP）、Hosted UI |
| CDK スタック | `cdk/lib/cognito-stack.ts`（`CognitoStack`） |
| `.env` 更新 | CDK outputs から `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_DOMAIN` を自動書き込み |
| 実装 | `setup/src/components/step1a-cdk.tsx` + `setup/src/app/api/cdk-deploy/route.ts` |
| 注意 | CDK は `cdk.json` がある**プロジェクトルート**から実行する（`cwd: resolve(process.cwd(), "..")`） |

### 0.3. Step 1a — Cognito 管理ユーザー作成 ✅

| 項目 | 内容 |
|------|------|
| 概要 | セットアップ画面でメールアドレス・パスワードを入力し、Cognito SDK（`AdminCreateUser` + `AdminSetUserPassword`）でユーザー作成 |
| 認証フロー | Cognito Hosted UI（リダイレクト方式。カスタムログイン画面は作らない） |
| 二重作成防止 | `ListUsers` API で既存ユーザー一覧を取得し、フォーム送信前にメールアドレスの重複チェック |
| 2FA 設定案内 | ユーザー作成後、Hosted UI ログイン URL をボタン表示。手順 4 ステップを案内 |
| リダイレクトエラー案内 | 2FA 設定完了後の `localhost:3000/admin?code=...` エラーは正常動作である旨を赤色警告で表示 |
| 実装 | `setup/src/components/step1a-cognito-user.tsx` + `setup/src/app/api/cognito-user/route.ts` + `setup/src/app/api/cognito-users/route.ts` |

### 0.4. Phase 0 完了状態 ✅

| 条件 | 状態 |
|------|------|
| AWS 接続 | root キーで STS 接続確認済み |
| CognitoStack デプロイ | User Pool + Hosted UI 構築済み |
| 管理者ユーザー | Cognito にユーザー作成済み、2FA（TOTP）設定済み |
| setup-state.json | setup1a が completed、currentPhase が setup1b に進行 |

> **次のフェーズ（setup1b 以降）は未実装。**
> IAM ユーザー作成（setup1b-iam）は setup1b 完了後に実行する設計。
> setup1b では InfraStack（CloudFront, Lambda, S3, DynamoDB, WAF）を CDK デプロイする。
> ただし **CDK デプロイの前に、homepage 本体アプリの v2 ソースコード修正（Phase 1〜5）が必要。**
> Lambda にデプロイするアプリが DynamoDB / S3 / Cognito を使うコードになっていないと動作しないため。

---

2026/4/20 okamo追記: 

Phase1から5の修正が一通り終わっているはずだが、進捗状況がこの資料に反映できていない。

【できてない点】記事一覧と記事詳細の日付は最終更新日でなく、公開日（dbの作成日でよい）。記事の並び順は公開日の新しい順序。

【できてない点】GoogleログインとStripeのパラメータは本番環境はシークレットマネジャーから取得し、ローカル開発時は環境変数から取得。

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

### 8.2. `src/middleware.ts` — IP・国情報の取得ヘッダー 🔲

| 項目 | 内容 |
|------|------|
| IP 取得（現状） | `x-fah-client-ip`（Firebase App Hosting 固有ヘッダー）を参照 |
| IP 取得（変更） | `CloudFront-Viewer-Address` に変更。取得不可時は `0.0.0.0`（フォールバックなし） |
| 国情報（現状） | コメント投稿時に外部 API（`ip-api.com`）で IP → 国コードを取得 |
| 国情報（変更） | CloudFront ヘッダー `CloudFront-Viewer-Country`（国コード）・`CloudFront-Viewer-Country-Region-Name`（地域名）を使用。外部 API 呼び出しを廃止 |
| 影響ファイル | `src/middleware.ts`, `src/app/api/articles/[slug]/comments/route.ts` |

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

### 2026/04/20 — セットアップアプリ（Phase 0）構築

**完了済み作業:**

| 作業 | 状態 | 備考 |
|------|------|------|
| セットアップアプリ基盤（`setup/`） | ✅ | Next.js 16, Tailwind CSS v4, port 3001 |
| 左サイドバー + フェーズ進捗管理 UI | ✅ | `setup-state.json` で JSON 状態管理 |
| Step 0 — AWS キー入力 | ✅ | STS 接続テスト付き |
| Step 1a — CDK デプロイ（CognitoStack） | ✅ | bootstrap + deploy + `.env` 自動更新 |
| Step 1a — Cognito ユーザー作成 | ✅ | 重複チェック + ユーザー一覧 + 2FA 案内 |
| CDK cwd バグ修正 | ✅ | `cdk/` → プロジェクトルートに修正 |

**Cognito リソース（デプロイ済み）:**

| リソース | 値 |
|---------|-----|
| User Pool ID | `ap-northeast-1_65i3Yxhu5` |
| Client ID | `3h5f3rgdqplgfkkifm4u7bkj8p` |
| Hosted UI Domain | `homepage-admin-210387976006.auth.ap-northeast-1.amazoncognito.com` |

**次の作業方針:**
- **次は homepage 本体のソースコード修正（Phase 1〜5）を実施する。**
- CDK での InfraStack デプロイ（setup1b）は、本体コードの v2 修正が完了した後に行う。
- Lambda にデプロイするアプリが DynamoDB / S3 / Cognito を使うコードになっている必要があるため。
- 修正は下記「修正の推奨順序」の Phase 1 から着手する。

---

## 修正の推奨順序

```
Phase 0: セットアップアプリ（`setup/` ディレクトリの独立 Next.js アプリ）  ← ✅ 完了
  0.1  Step 0 — root アクセスキー入力画面  ✅
  0.2  Step 1a — CDK デプロイ（CognitoStack）  ✅
  0.3  Step 1a — Cognito 管理ユーザー作成  ✅
  → CognitoStack デプロイ済み、管理者ユーザー作成済み、2FA 設定済み

Phase 1: コアライブラリ（P0）  ← ★次はここから着手★
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
