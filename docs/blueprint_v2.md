# Project: homepage-v2（v1 → v2 移行方針）

## 1. 背景

2027年3月のFirebase Studio終了を受け、v1のインフラ基盤をFirebaseからAWSへ移行する。

**v2の目的：非エンジニアでも簡単セットアップできる仕組みを作る**

v1では「GUIの設定画面が多すぎて詰む」という課題があった。v2ではAWS CDK（インフラのコード化）とvscode/wslを活用し、セットアップの自動化を目指す。

---

## 2. v1からの変更点

| 項目 | v1 | v2 | 変更理由 |
| :--- | :--- | :--- | :--- |
| **インフラ** | Firebase | AWS | CDKで設定を自動化できるため |
| **DB** | Firestore | DynamoDB | CDKとの相性が良い |
| **ストレージ** | GCS | S3 | AWS統一 |
| **CDN** | Firebase App Hosting | CloudFront | ミドルウェア経由でもキャッシュ可能（後述） |
| **セットアップ** | 手動設定 + CLI | AWS CDK | ローカルセットアップ画面にIAMキーを入力して実行 |
| **管理画面** | 同一ドメイン | `/admin/*` をフォルダで分離 | 認証基盤を分けてセキュリティ向上 |
| **管理者認証** | Firebase Auth（カスタムクレーム） | Cognito（2FA必須、Hosted UI） | AWS管理 + セキュリティ強化 |
| **利用者認証** | Google OAuth | Google OAuth（継続） | 変更なし |
| **サーバーアクション** | `'use server'` | `/api/xxx` Route Handler | CloudFront OAC互換 + セキュリティ強化（後述） |

---

## 3. CDN対応（v1で断念した課題の解決）

### v1で断念した理由

Firebase App Hostingでは「ミドルウェアを経由するルートはCloud CDNでキャッシュされない」という制約があり、実質的にCDNキャッシュが使えなかった。

### v2での解決方針

CloudFrontには上記の制約がないため、以下の構成でCDNキャッシュを活用できる見込み：

| コンテンツ | キャッシュ | 備考 |
|-----------|----------|------|
| トップページ、法務ページ、無料記事 | ✅ する | 静的部分をCDNエッジでキャッシュ |
| タグページ | ✅ する | 記事一覧と同様にキャッシュ |
| メディアファイル | ✅ する | S3 → CloudFront、長期キャッシュ |
| ヘッダー（ログイン状態） | ❌ しない | クライアントからAPIでfetch |
| コメント | ❌ しない | クライアントからAPIでfetch |
| 有料記事本文 | ❌ しない | アクセス権チェック後にAPIでfetch |
| 退会関連、決済関連 | ❌ しない | 動的処理 |
| 管理画面 | ❌ しない | Cognito 認証必須 |
| API エンドポイント | ❌ しない | 動的レスポンス |

**補足：** 完全な静的サイトにするわけではない。動的に生成されるページの静的部分がCDNにキャッシュされれば十分。

### キャッシュ戦略（確定方針）

**アプリ側ではキャッシュ有ヘッダーを出さない。** Next.js は `searchParams` 使用ページに `no-store, must-revalidate` を強制付与するため、アプリ側で `Cache-Control` を設定しても上書きされる。キャッシュ制御は **CloudFront Cache Policy の Minimum TTL** で行う。

#### CloudFront Behavior 構成

| Behavior パターン | オリジン | キャッシュ | TTL |
|------------------|---------|----------|-----|
| `/media/*` | S3（OAC） | ✅ | 長期（31536000s） |
| `/api/*` | Lambda Function URL | ❌ CachingDisabled | — |
| `/admin/*` | Lambda Function URL | ❌ CachingDisabled | — |
| `/auth/*` | Lambda Function URL | ❌ CachingDisabled | — |
| `/withdraw/*` | Lambda Function URL | ❌ CachingDisabled | — |
| `/payment/*` | Lambda Function URL | ❌ CachingDisabled | — |
| `/*`（デフォルト） | Lambda Function URL | ✅ Custom Policy | Minimum TTL 3600s（1時間） |

#### Cache Key 設定（デフォルト Behavior）

| パラメータ | 設定 |
|-----------|------|
| Query Strings | Include: `cursor`, `tag`（ページネーション・タグ絞り込み用） |
| Headers | None（Cookie・認証ヘッダーは Cache Key に含めない） |
| Cookies | None（CDN キャッシュは認証状態に依存しない設計のため） |

#### アプリ側の Cache-Control ヘッダー

`middleware.ts` で CloudFront CachingDisabled 対象パスに `Cache-Control: no-store, must-revalidate` を一括付与する。個別ルートでの設定は不要。

| 対象パス | Cache-Control | 設定箇所 |
|---------|--------------|---------|
| `/api/*` | `no-store, must-revalidate` | middleware.ts |
| `/admin/*` | `no-store, must-revalidate` | middleware.ts |
| `/auth/*` | `no-store, must-revalidate` | middleware.ts |
| `/withdraw/*` | `no-store, must-revalidate` | middleware.ts |
| `/payment/*` | `no-store, must-revalidate` | middleware.ts |
| その他（`/`, `/articles/*`, `/tags/*`） | （設定なし） | Next.js が `no-store` を強制。CloudFront の Minimum TTL で上書き |

### キャッシュ更新方式（CloudFront Invalidation）

SSR + CloudFrontのTTLベースキャッシュを採用する。記事の公開・更新・削除時にCloudFront Invalidation APIを呼び出してキャッシュをパージする。

#### Invalidation 実装

`src/lib/cloudfront.ts` に `invalidateCloudFrontCache(paths)` ユーティリティを実装。環境変数 `CLOUDFRONT_DISTRIBUTION_ID` が未設定の場合はスキップ（ローカル開発時）。

| 管理操作 | Invalidation パス |
|---------|------------------|
| 記事更新（ステータス/アクセス変更） | `/articles/{slug}`, `/`, `/tags/*` |
| 記事修正（AI リライト） | `/articles/{slug}`, `/`, `/tags/*` |
| 記事削除 | `/articles/{slug}`, `/`, `/tags/*` |
| サイト設定変更 | `/`, `/legal/*`, `/articles/*`, `/tags/*` |

**注意:** `/*` ワイルドカードは全エッジ全オブジェクトのクリアに時間がかかるため、可能な限り個別パス指定を使用する。

`generateStaticParams` + ISR方式は以下の理由で不採用：
- ビルド時に全記事slugを取得する処理が必要
- On-demand revalidation の仕組みが複雑
- CloudFront Invalidation で同等の効果が得られる

### ログイン状態の安全性

CloudFront でページ HTML をキャッシュしても、ログイン状態に起因するデータ漏洩は発生しない：

| コンポーネント | レンダリング | 認証情報の取得方法 |
|-------------|-----------|-----------------|
| ヘッダー（ユーザーアイコン等） | Client (`header-client.tsx`) | `fetch('/api/auth/me')` |
| コメント一覧 | Client (`comment-section.tsx`) | `fetch('/api/articles/[slug]/comments')` |
| 有料記事本文 | Client (`paid-article-content.tsx`) | `fetch('/api/articles/[slug]/content')` |
| 課金ボタン | Client (`PaywallClient`) | `fetch('/api/stripe/config')` |

全てのユーザー固有コンテンツはクライアントサイドで `/api/` 経由取得のため、サーバーレンダリング HTML にはユーザー固有情報が含まれない。

---

## 3.5. Server Actions (`'use server'`) の廃止

### 廃止理由

#### 1. CloudFront OAC との非互換

CloudFront OAC（Origin Access Control）では、`PUT`/`POST` リクエスト時にリクエストボディのSHA256ハッシュを `x-amz-content-sha256` ヘッダーに含める必要がある（AWS公式ドキュメント）。

Next.jsのServer Actionsはブラウザが内部的にPOSTリクエストを生成するため、このヘッダーを付与する手段がない。一方、`fetch()` APIなら任意のヘッダーを追加可能。

#### 2. React Server Components (RSC) の脆弱性リスク

RSCおよびServer Actionsに関連する深刻な脆弱性が頻発している：

| CVE | 日付 | CVSS | 概要 |
|-----|------|------|------|
| CVE-2025-55182 | 2025年11月 | **10.0 (Critical)** | RSCに関する重大な脆弱性 |
| CVE-2026-23869 | 2026年4月 | **7.5 (High)** | RSCに関する脆弱性 |

Server Actionsを禁止し `/api/xxx` Route Handlerに統一することで、RSC攻撃時のリスクを少しでも減らす。

### 移行方針

すべてのServer Actions (`'use server'`) を `/api/xxx` Route Handler + クライアントからの `fetch()` に置き換える。

### `x-amz-content-sha256` ヘッダーの実装方針

全てのPOST/PUT fetchに `x-amz-content-sha256` を付与するユーティリティ関数 `fetchWithSigning()` を作成する。

---

## 3.6. Stripe Webhook の CloudFront OAC 経由対応

### 問題

CloudFront OAC 経由の POST リクエストには `x-amz-content-sha256` ヘッダーが必要であることが実機検証で判明した（Server Actions → `fetchWithSigning()` への移行で解消）。

Stripe Webhook は Stripe のサーバーから直接 POST されるため、`x-amz-content-sha256` ヘッダーを付与する手段がない。

### 対策: Webhook Proxy Lambda

CloudFront を経由しない専用の Lambda Function URL を Stripe Webhook のエンドポイントとして使い、そこから本来の Next.js Lambda に署名付きで代理 POST する。

```
[Stripe] → POST → Webhook Proxy Lambda (認証なし・直接公開)
                        ↓
                   x-amz-content-sha256 を計算
                        ↓
                   POST → CloudFront (OAC) → Next.js Lambda
                                               ↓
                                        /api/stripe/webhook で処理
```

| 項目 | 内容 |
|------|------|
| Webhook Proxy Lambda | Node.js、コード数十行程度 |
| 認証 | Lambda Function URL（AuthType: NONE） |
| セキュリティ | proxy は転送のみ。Stripe 署名検証（`stripe-signature`）は Next.js 側で実施 |
| Stripe Dashboard の設定 | Webhook URL を Proxy Lambda の Function URL に変更 |

**補足:** Proxy Lambda では Stripe 署名検証を行わない。リクエストボディと `stripe-signature` ヘッダーをそのまま転送し、最終的な検証は Next.js 側の既存ロジック（`stripe.webhooks.constructEvent()`）で行う。これにより Proxy Lambda の責務を最小化し、Webhook Secret の管理箇所を一元化する。

**代替案の検討:** CDK構築フェーズで OAC 経由の通常 POST（`x-amz-content-sha256` なし）が通るかテストし、通る場合は Proxy Lambda を省略して Stripe → CloudFront 直接構成にする。

---

## 3.7. AI 記事生成/修正の非同期化（CloudFront タイムアウト対策）

### 問題

CloudFront の Origin Response Timeout は最大 60 秒だが、Gemini AI による記事の生成・修正は 1 分以上かかることがある。`/admin/*` パスも CloudFront 経由（WAF + Cognito 認証のため CloudFront 必須）なので、タイムアウトを回避できない。

### 対策: 非同期ジョブ + ポーリング

AI 処理をジョブとして非同期実行し、クライアントからポーリングで完了を確認する。

```
[管理画面] → POST /api/admin/articles/generate
                 ↓
           ジョブID を即座に返す（DynamoDB homepage-jobs にレコード作成）
           Lambda 内で AI 処理を非同期継続（最大 15 分 = Lambda MAX タイムアウト）
                 ↓
[管理画面] → GET /api/admin/jobs/{jobId}  （ポーリング）
                 ↓
           処理完了時: { status: "completed", result: { articleId: "..." } }
           処理中:     { status: "processing" }
           エラー時:   { status: "failed", error: "..." }
```

### 設計

| 項目 | 内容 |
|------|------|
| ジョブ状態保存先 | DynamoDB `homepage-jobs` テーブル（設計は `database-schema_v2.md` 参照） |
| ポーリング間隔 | クライアント側 3〜5 秒間隔 |
| タイムアウト | 最大 15 分（Lambda の MAX タイムアウト） |
| 対象 API | `POST /api/admin/articles/generate`（AI 下書き生成）、`POST /api/admin/articles/[id]/revise`（AI 記事修正） |
| ジョブ確認 API | `GET /api/admin/jobs/[jobId]` — ジョブ状態を返す |

### Lambda タイムアウト設定

AI 記事生成を行う Lambda は CloudFront の 60 秒タイムアウトとは独立して最大 15 分動作する。ただし、HTTP レスポンスはジョブ ID を即座に返すため、CloudFront のタイムアウトには抵触しない。

---

## 4. 認証の設計

| 対象 | 認証方式 | 備考 |
|------|---------|------|
| 利用者（閲覧者） | Google OAuth | ログインのみに利用 |
| 管理者 | Cognito（2FA必須） | `/admin/*` へのアクセス時にJWT検証 |

### 管理画面のセキュリティ（2重防御）

`/admin/*` パスは以下の2本立てで防護する：

| レイヤー | 技術 | 目的 |
|---------|------|------|
| 1. ネットワーク層 | WAF IP制限 | 許可IPのみ通過。CloudFrontエッジで即ブロック |
| 2. 認証層 | Cognito + TOTP 2FA | ユーザー名 + パスワード + 認証アプリ（TOTP） |

**WAF IP制限の実装:**
- CloudFrontに紐付けたAWS WAF Web ACLで `IPSet` ルールを設定
- `/admin/*` パスへのリクエストのみにIP制限を適用（他のパスは制限なし）
- CDKでは `aws-wafwebacl-cloudfront` Solutions Constructを活用
- 固定IPなしの環境を考慮して、セットアップ画面でCAPTHA（IP制限なし）を選択することも可能とする

**Cognito 2FA の実装:**
- Cognitoユーザープールで「MFA必須」に設定
- TOTP（Time-based One-Time Password）を採用（認証アプリ: Google Authenticator等）
- 管理者はサインアップ時にTOTPデバイスを登録
- ログイン画面は **Cognito Hosted UI**（リダイレクト方式）を使用。カスタムログイン画面は作らない

**管理画面へのアクセス方法:**
- ヘッダーやメニューに管理画面リンクは **表示しない**（セキュリティ上の理由）
- 管理者は `/admin` パスに URL 直接アクセスする

---

## 5. セットアップの流れ（想定）

> **セットアップアプリの配置:** 本リポジトリ内の `setup/` ディレクトリに独立した Next.js アプリとして配置する。

**セットアップアプリの技術構成:**

| 項目 | 内容 |
|------|------|
| フレームワーク | Next.js 16 (App Router) |
| ポート | `localhost:3001`（本体アプリと別ポート） |
| スタイル | Tailwind CSS v4 |
| 状態管理 | `setup/setup-state.json`（JSON ファイル。後述） |
| 設定値管理 | 親ディレクトリの `.env` を読み書き |
| UI 構成 | 左サイドバー（フェーズ一覧 + 進捗状態表示）+ メインコンテンツ |

**ディレクトリ構成:**
```
setup/
├── setup-state.json          # セットアップ進捗（.gitignore 対象）
├── src/
│   ├── app/
│   │   ├── layout.tsx        # Sidebar + メインの flex レイアウト
│   │   ├── page.tsx          # currentPhase にリダイレクト
│   │   ├── setup0/page.tsx   # AWS キー入力
│   │   ├── setup1a/page.tsx  # CDK デプロイ + Cognito ユーザー作成
│   │   ├── setup1b/page.tsx  # サイト公開（未実装）
│   │   ├── setup1c/page.tsx  # Google OAuth 案内（homepage管理画面で設定）
│   │   ├── setup1c-iam/      # IAM ユーザー作成（未実装）
│   │   ├── setup2a/page.tsx  # Stripe サンドボックス案内（homepage管理画面で設定）
│   │   ├── setup2b/page.tsx  # 独自ドメイン（未実装）
│   │   ├── setup3/page.tsx   # Stripe 本番化案内（homepage管理画面で設定）
│   │   └── api/              # aws-key, cdk-deploy, cognito-user, cognito-users, cognito-info, status
│   ├── components/
│   │   ├── sidebar.tsx       # 左サイドバー
│   │   ├── step0-aws-key.tsx
│   │   ├── step1a-cdk.tsx
│   │   └── step1a-cognito-user.tsx
│   └── lib/
│       ├── env.ts            # .env 読み書き
│       └── setup-state.ts    # setup-state.json 管理
```

### ステップ概要

> **命名規則:** setup1 / setup2 / setup3 は v1 のセットアップ手順（`docs/setup1.md`＝決済なし、`docs/setup2.md`＝Stripe サンドボックス追加、`docs/setup3.md`＝Stripe 本番化）に対応している。v2 ではサブステップ（1a, 1b, 1c, 2a, 2b）に細分化したが、大区分の対応関係を維持することで v1 ↔ v2 のマニュアル間の参照を容易にしている。

| ステップ | 内容 | 到達状態 | 使用ツール |
|----------|------|----------|------------|
| **setup0** | VSCode + WSL 環境構築 + AWS キー入力 | セットアップ画面が起動、AWS 接続済み | WSLイメージ import + セットアップ画面 |
| **setup1a** | 管理者アカウントのセットアップ | Cognito 2FA で管理者ログイン可能 | CDK + セットアップ画面 |
| **setup1b** | サイト公開（最小構成） | CloudFrontドメインでサイト公開（フロントログイン不可・無料記事閲覧のみ。管理画面はCognitoログイン可能） | CDK + セットアップ画面 |
| **setup1c** | Gemini API Key / Google OAuth 設定 | 記事追加、Google ログイン・コメント投稿が動作（決済なし） | homepage 管理画面 |
| **setup1c 後** | IAM ユーザー作成 + root キー無効化案内 | 安全な IAM ユーザーキーで運用開始 | セットアップ画面 |
| **setup2a** | Stripe サンドボックス設定 | テスト決済が動作 | homepage 管理画面 |
| **setup2b** | AWSで新規ドメイン取得、独自ドメイン設定 | 独自ドメインでアクセス可能 | CDK + セットアップ画面 |
| **setup3** | Stripe 本番化 | 本番決済が動作 | homepage 管理画面 |

#### setup0: 開発環境の構築

- WSLの完成イメージ（Docker, Node.js, AWS CLI等を構成済み）を配布
- ユーザーは WSLイメージを DL → `wsl --import` で環境を構築
- VSCode + WSL拡張機能でセットアップサポート画面を起動
- セットアップ画面で AWS root アクセスキーを入力 → `.env` に書き込み

> **AWS キーの運用**: root アクセスキーは有効期限付きで発行してもらう（手順書で案内）。
> root キーは setup1a・1b の CDK デプロイに使用した後、setup1c 完了後にセットアップ画面が
> IAM ユーザーを自動作成し、`.env` のキーを差し替える。
> setup1cの完了後、root キーの無効化をユーザーに案内する。

#### setup1a: 管理者アカウントのセットアップ（Cognito 2FA）

- `.env` の AWS キーを使って CDK で Cognito User Pool を構築
- セットアップ画面から管理者ユーザーを作成し、2FA（TOTP）を設定
- CDK が作成した `COGNITO_USER_POOL_ID` / `COGNITO_CLIENT_ID` を `.env` に自動書き込み
- 管理画面 `/admin/*` へのアクセス時に Cognito JWT で認証
- この時点では管理画面にログインできるだけ（サイト自体は未デプロイ）

#### setup1b: サイト公開（最小構成）

- CDK + セットアップ画面で AWS リソースを自動構築
- CDK が作成したリソース名（`TABLE_PREFIX`, `S3_BUCKET_NAME` 等）を `.env` に自動書き込み
- 独自ドメインなし（CloudFrontのデフォルトドメイン `xxx.cloudfront.net` で公開）
- Cogniteログイン後の許可ドメインも追加が必要
- 決済機能なし、フロント（Google OAuth）ログイン不可（無料記事閲覧のみ）
- 管理画面のIP制限はYes/No（IP制限 or CAPTCHA）を選択可能。Noの場合はCAPTHA有りのWAFルールになる。後日にWAFの許可IPを変更できるように、セットアップフローとは別メニューで「IPアドレス制限/CAPTCHA切り替え。許可ip-setsの変更」の機能をローカルセットアップ画面に便利メニューとして追加。homepage管理画面へのリンクボタンも便利メニューに追追加。

#### setup1c: Gemini API Key / Google OAuth 設定

- homepage の管理画面から Gemini API Key, Google OAuth シークレット を登録。
- CDKの再実行は不要（homepage管理画面とGCPコンソールで完結）
- Google AuthのコールバックURL設定も必要（GCPコンソールでの設定方法を案内。ブランディング設定/申請は独自ドメイン化setup2bで実質）
- 設定後、管理画面からの記事追加/修正、Google ログイン・コメント投稿が動作する状態になる（この時点では決済と独自ドメインがない）

> **setup1c 完了後**: セットアップ画面が IAM ユーザー `homepage-deployer` を自動作成し、
> `.env` の `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` を IAM ユーザーのキーに差し替える。
> 必要な権限はstep1cまでに必要な権限（後で前フェーズを再実行する場合もある）と、step1c以降で必要となる権限。homepage以外のAWSリソースを勝手にいじれない権限にする。
> その後、「AWS コンソールで root アクセスキーを無効化してください」と案内する。

#### setup2a: 決済機能（Stripeサンドボックス）

- homepage の管理画面から Stripe のテスト用 APIキー・Webhook Signing Secret を登録
- CDKの再実行は不要（Stripeダッシュボードとhomepage管理画面で完結）
- Stripe Dashboard 側で Webhook URL の登録が必要（手順書で案内）
- サンドボックス環境でテスト決済を確認

#### setup2b: 独自ドメインの設定

- AWSでの新規ドメイン取得を前提とし、ドメイン取得から自動化する
- ドメイン取得: AWS SDK `RegisterDomain` API を使用（CDK 非対応のため）
- 連絡先情報（名前・住所・電話番号）の入力フォームを準備。初期値は AWS アカウントの登録情報を自動セット
- WHOIS 保護は ON にする
- 「AWSでドメインを管理しない」を選択した場合、Route53 は登録せず、CloudFront の CNAME レコードの案内のみ表示。画面上では「AWSで新規ドメインを取得/管理」を推奨する。
- CDK + セットアップ画面でドメイン関連リソースを追加
- ACM証明書の発行、CloudFront の Alternate Domain 設定、Route 53 のレコード作成
- Stripe Dashboard の Webhook URL を独自ドメインに更新
- Google AuthのコールバックURL変更やブランディング設定も必要（GCPコンソールでの設定方法を案内）
- Cogniteログイン後の許可ドメインも追加が必要

#### setup3: 決済機能（Stripe本番化）

- homepage の管理画面から Stripe の本番用 APIキー・Webhook Signing Secret に差し替え
- CDKの再実行は不要（Stripeダッシュボードとhomepage管理画面で完結）
- Stripe Dashboard で本番 Webhook URL を登録

### 事前準備（人間が行う作業）

以下はセットアップ画面が代行できないため、手順書を用意する。

1. AWSアカウント作成 + root アクセスキーの有効期限付き発行
2. WSLイメージのインポート + VSCodeのインストール
3. Gemini API Key の取得
4. Google OAuthの設定(有効化→OAuthクライアントID作成→同意画面＞ブランディングの設定)
5. Stripeアカウント作成とAPIキー発行/Webhook設定

### CDK による自動構築

事前準備で取得したAPIキー等をセットアップ画面に入力し、CDKでインフラを構築する。
全ての設定値は `.env` を単一ソースとして管理する（詳細は `docs/secrets-and-env_v2.md` を随時更新していく）

### セットアップ状態管理（setup-state.json）

セットアップの進捗は `setup/setup-state.json` に記録する。

```jsonc
// setup/setup-state.json（例）
{
  "currentPhase": "setup1a",
  "phases": {
    "setup0": {
      "status": "completed",
      "completedAt": "2026-04-19T10:30:00Z",
      "comment": "AWS root key verified via STS GetCallerIdentity, account 210387976006"
    },
    "setup1a": {
      "status": "in-progress",
      "startedAt": "2026-04-19T10:35:00Z",
      "comment": "CDK deploy succeeded. Cognito user creation pending."
    },
    "setup1b": { "status": "not-started" },
    "setup1c": { "status": "not-started" },
    "setup2a": { "status": "not-started" },
    "setup2b": { "status": "not-started" },
    "setup3": { "status": "not-started" },
    // ...
  }
}
```

**設計意図:**

| 観点 | 説明 |
|------|------|
| AI サポート | エラー時や途中再開時に AI がファイル1つ読むだけで全状況を把握できる |
| 進捗表示 | セットアップ画面の左メニューがこの JSON から進捗状態を表示 |
| エラー追跡 | 各フェーズの `errors` 配列にエラー履歴を残し、トラブルシュートを容易に |
| `.env` との分離 | `.env` は純粋に設定値のみ。セットアップ進捗という関心事を分離 |

> **`.env` と setup-state.json の役割分担:**
> - `.env`: AWS キー、リソース名、API キー等の **設定値** を保持。CDK と `next dev` が参照
> - `setup-state.json`: セットアップの **進捗・履歴** を保持。セットアップ画面と AI が参照

### CDK スタックのフェーズ分割

CDK スタックはセットアップフェーズに対応して分割する。各フェーズで `cdk deploy StackName` を個別実行できる。

| フェーズ | CDK スタック名 | 主なリソース |
|---------|-------------|------------|
| setup1a | `HomepageCognitoStack` | Cognito User Pool (MFA必須/TOTP), Hosted UI |
| setup1b | `InfraStack` | Dynamo DB (articles, article_tags, users, comments, payments, jobs, settings), S3, Lambda, ECR, WAF, CloudFront(Lambda origin 追加) |
| setup2b | `DomainStack` | ACM Certificate, Route 53, CloudFront Alternate Domain |

### 設定値の保存先と用途の整理

| 格納先 | 書き込み元 | 読み取り元 | 保持する情報 |
|--------|-----------|-----------|------------|
| `.env` | セットアップ画面 / CDK outputs | CDK deploy, `next dev`, AWS SDK | AWS キー, リソース名, ローカル開発用 API キー |
| `setup-state.json` | セットアップ画面 API | セットアップ画面 UI, AI | フェーズ進捗, エラー履歴, コメント |
| Secrets Manager | homepage 管理画面 | 本番 Lambda | Gemini API Key, Stripe キー, Google OAuth シークレット |
| DynamoDB (settings) | homepage 管理画面 | 本番 Lambda | サイト名, 決済金額等の運用設定 |

> **ローカル開発時の Gemini API Key, Stripe キー, Google OAuth シークレット:**
> `.env` にも Gemini API Key, Stripe キー, Google OAuth シークレット を記載する。
> これはローカル `next dev` 時に本番の Secrets Manager を参照せず、
> Stripe サンドボックスや Google OAuth テスト環境を使えるようにするため。
> 本番 Lambda は Secrets Manager から取得するので、`.env` の値は本番には影響しない。

---

## 6. 技術構成

### アーキテクチャ概要

```
[ユーザー] → CloudFront → Lambda Function URL → Lambda (Next.js + Web Adapter)
                ↓
              S3 (静的ファイル)
```

### Lambda Web Adapter 方式を採用

Next.jsアプリをDockerコンテナ化し、Lambda Web Adapterを使ってLambda上で動作させる。

| レイヤー | 技術 | 備考 |
|---------|------|------|
| フロント配信 | CloudFront | OACでセキュア化。画像も同一ドメインから配信（`/media/*`） |
| SSR/API | Lambda + Lambda Web Adapter | ECRからコンテナイメージをデプロイ |
| 静的ファイル | S3 | CloudFrontのBehaviorで振り分け |
| DB | DynamoDB | - |
| ストレージ | S3 | - |
| 管理者認証 | Cognito | `/admin/*` へのアクセス時にJWT検証 |
| 利用者認証 | Google OAuth | - |
| 決済 | Stripe | - |
| インフラ管理 | AWS CDK | - |
| コンテナレジストリ | ECR | イメージタグで切り戻し可能 |
| 開発環境 | VSCode + GitHub Copilot + Docker (WSL) | - |

### この方式を選んだ理由

1. **CloudFrontの自由度**: Firebase App Hostingの「ミドルウェア問題」が存在しない
2. **Next.js互換性**: `output: "standalone"` + Lambda Web Adapter で App Router/SSR/ISR が動作
3. **切り戻しの容易さ**: ECRのイメージタグでロールバック可能
4. **透明性**: 仕組みが明確でAIエージェントが把握しやすい
5. **フレームワーク非依存**: Lambda Web AdapterはHTTPを喋るアプリなら何でも動く（Next.js, Nuxt, SvelteKit, Express, Django, Rails等）。将来フレームワークを変更しても同じ方式が使える
6. **コスト面**: Lambdaは従量課金（リクエストがなければ0円）。個人メディアのようにアクセスにムラがあるケースに最適

### Amplify を使わない理由

AWS Amplifyはセットアップが簡単だが、以下の理由で採用しない：

- **ブラックボックスが多い**: 内部で何が起きているか把握しづらい
- **AIエージェントとの相性**: CDKのように「コードで全てを定義」できないため、エージェントが状況を把握しにくい
- **カスタマイズの制限**: CloudFrontの細かい設定（Behavior、Cloudfront Functions等）を自由に制御しづらい

### SST/OpenNext を使わない理由

SST（Serverless Stack）やOpenNextも選択肢だが、以下の理由で採用しない：

- **変換処理がブラックボックス**: OpenNextはNext.jsのビルド出力を独自形式に変換する。この変換ロジックが不透明
- **複数Lambdaが生成される**: Server, ImageOptimization, Revalidation等、複数のLambdaが自動生成され、構成が複雑化
- **デバッグが難しい**: 変換後の動作がローカルと異なる可能性があり、問題の切り分けが困難
- **Next.jsバージョン追従の懸念**: Next.jsの変更にOpenNextが追従する必要があり、タイムラグや互換性問題のリスク

Lambda Web Adapter方式は「Dockerで動くものがそのままLambdaで動く」ため、ローカルと本番の差異が少なく、問題の切り分けが容易。

### Lambda コールドスタートについて

| 項目 | 対策 |
|------|------|
| メモリサイズ | 1024MB以上を推奨 |
| アーキテクチャ | ARM64（Graviton）推奨 |
| Provisioned Concurrency | 個人メディア規模では不要（高コスト） |

**CDNキャッシュとの関係:**

```
[ユーザー] → CloudFront
              ↓
       キャッシュヒット？
         ├── Yes → エッジから即座に返却（Lambdaに到達しない = コールドスタート影響なし）
         └── No  → Lambda（コールドスタートの可能性あり）
```

無料記事やトップページがCDNキャッシュされれば、大部分のリクエストはエッジから返却されるため、コールドスタートの影響は限定的。

### 将来のスケールアップ（参考）

アクセスが大幅に増えた場合の移行パス：

| 規模 | 構成 | 月額目安 |
|------|------|---------|
| 小〜中（現在想定） | Lambda + CloudFront | 数百円〜 |
| 大（常時アクセスあり） | ECS Fargate | 3,000円〜 |

Lambda Web Adapter方式は**同じDockerイメージをECSでも使える**ため、将来の移行が容易。
