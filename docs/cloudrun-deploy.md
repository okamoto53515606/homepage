# Cloud Run デプロイ手順

本番環境を Cloud Run (asia-northeast1) にデプロイする手順書です。

---

## 前提条件

- **GCPプロジェクト**: `.env.production` の `NEXT_PUBLIC_FIREBASE_PROJECT_ID` を参照
- **Cloud Run リージョン**: `asia-northeast1`（東京）
- **Firestore リージョン**: `asia-northeast1`（東京）
- **Artifact Registry リポジトリ**: `homepage-images`（asia-northeast1）
- **サービスアカウント**: `firebase-app-hosting-compute@<PROJECT_ID>.iam.gserviceaccount.com`
- **gcloud CLI** がインストール・認証済みであること
- **`.env.production`** がプロジェクトルートに存在すること（実際の値はこのファイルを参照）

---

## アーキテクチャ概要

```
[ブラウザ] → [Cloud Run (asia-northeast1)] → [Firestore (asia-northeast1)]
                                             → [Firebase Auth]
                                             → [Firebase Storage]
                                             → [Stripe API]
                                             → [Gemini API]
```

- Next.js を `output: 'standalone'` でビルドし、Docker コンテナとして実行
- `NEXT_PUBLIC_*` 環境変数はビルド時に埋め込み（Cloud Build の `--build-arg` 経由）
- サーバーサイド環境変数は Cloud Run の `--set-env-vars` で実行時に注入

---

## 関連ファイル

| ファイル            | 説明                                              |
| ------------------- | ------------------------------------------------- |
| `Dockerfile`        | マルチステージビルド（deps → builder → runner）   |
| `cloudbuild.yaml`   | Cloud Build 設定（Docker ビルド + イメージ push） |
| `.dockerignore`     | Docker コンテキストから除外するファイル            |
| `next.config.ts`    | `output: 'standalone'` 設定                       |
| `apphosting.yaml`   | Firebase App Hosting 用設定（Cloud Run では不使用）|

---

## 手順1: コンテナイメージのビルド

Cloud Build を使用してイメージをビルドし、Artifact Registry にプッシュします。
環境変数の値は `.env.production` を参照してください。

```bash
# バージョンタグを決定（v1, v2, ... と連番管理）
# <PROJECT_ID> は .env.production の NEXT_PUBLIC_FIREBASE_PROJECT_ID の値
IMAGE_TAG=asia-northeast1-docker.pkg.dev/<PROJECT_ID>/homepage-images/homepage:v4

gcloud builds submit \
  --config=cloudbuild.yaml \
  --project=<PROJECT_ID> \
  --region=asia-northeast1 \
  --substitutions="\
_IMAGE_TAG=${IMAGE_TAG},\
_NEXT_PUBLIC_FIREBASE_API_KEY=xxx,\
_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=xxx,\
_NEXT_PUBLIC_FIREBASE_PROJECT_ID=xxx,\
_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=xxx,\
_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=xxx,\
_NEXT_PUBLIC_FIREBASE_APP_ID=xxx,\
_NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxx,\
_NEXT_PUBLIC_STRIPE_PUBLIC_KEY=xxx"
# ※ 各 xxx を .env.production の対応する値に置き換えてください
```

ビルドには約5分かかります。完了後、`SUCCESS` と表示されればOKです。

### ビルドステータスの確認

```bash
# ビルドIDを指定してステータス確認
gcloud builds describe <BUILD_ID> \
  --project=<PROJECT_ID> \
  --region=asia-northeast1 \
  --format="value(status)"
```

---

## 手順2: Cloud Run へデプロイ

環境変数の値は `.env.production` を参照してください。

```bash
# <PROJECT_ID> は .env.production の NEXT_PUBLIC_FIREBASE_PROJECT_ID の値
gcloud run deploy homepage \
  --image=asia-northeast1-docker.pkg.dev/<PROJECT_ID>/homepage-images/homepage:v4 \
  --region=asia-northeast1 \
  --project=<PROJECT_ID> \
  --platform=managed \
  --port=8080 \
  --allow-unauthenticated \
  --service-account=firebase-app-hosting-compute@<PROJECT_ID>.iam.gserviceaccount.com \
  --memory=512Mi \
  --cpu=1 \
  --max-instances=1 \
  --min-instances=0 \
  --timeout=300 \
  --set-env-vars="\
GEMINI_API_KEY=xxx,\
NEXT_PUBLIC_FIREBASE_API_KEY=xxx,\
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=xxx,\
NEXT_PUBLIC_FIREBASE_PROJECT_ID=xxx,\
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=xxx,\
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=xxx,\
NEXT_PUBLIC_FIREBASE_APP_ID=xxx,\
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxx,\
NEXT_PUBLIC_STRIPE_PUBLIC_KEY=xxx,\
STRIPE_SECRET_KEY=xxx,\
STRIPE_WEBHOOK_SECRET=xxx,\
STRIPE_TAX_RATES=xxx,\
CSP_REPORT_ONLY=false,\
ALLOWED_IP_ADDRESSES_FOR_THE_ADMIN_PAGE=xxx,\
SESSION_DURATION_HOURS=120"
# ※ 各 xxx を .env.production の対応する値に置き換えてください
```

### デプロイ後の確認

```bash
# サービスURLの取得
gcloud run services describe homepage \
  --region=asia-northeast1 \
  --project=<PROJECT_ID> \
  --format="value(status.url)"

# レスポンス確認（<SERVICE_URL> は上記コマンドの出力）
curl -s -o /dev/null -w "HTTP:%{http_code} TTFB:%{time_starttransfer}s Total:%{time_total}s\n" \
  <SERVICE_URL>/
```

---

## 環境変数一覧

### ビルド時環境変数（`--build-arg` / `NEXT_PUBLIC_*`）

クライアントサイド JavaScript に埋め込まれる。イメージビルド時に指定が必要。

| 変数名                                     | 用途                     |
| ------------------------------------------ | ------------------------ |
| `NEXT_PUBLIC_FIREBASE_API_KEY`             | Firebase API キー        |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`         | Firebase Auth ドメイン   |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID`          | Firebase プロジェクトID  |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`      | Firebase Storage バケット|
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | FCM 送信者ID             |
| `NEXT_PUBLIC_FIREBASE_APP_ID`              | Firebase アプリID        |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`             | Google OAuth クライアントID |
| `NEXT_PUBLIC_STRIPE_PUBLIC_KEY`            | Stripe 公開キー          |

### 実行時環境変数（`--set-env-vars`）

サーバーサイドのみで使用。Cloud Run のデプロイ時に指定。

| 変数名                                       | 用途                              |
| -------------------------------------------- | --------------------------------- |
| `GEMINI_API_KEY`                             | Gemini API キー                   |
| `STRIPE_SECRET_KEY`                          | Stripe シークレットキー           |
| `STRIPE_WEBHOOK_SECRET`                      | Stripe Webhook 検証シークレット   |
| `STRIPE_TAX_RATES`                           | Stripe 税率ID                     |
| `CSP_REPORT_ONLY`                            | CSP レポートオンリーモード        |
| `ALLOWED_IP_ADDRESSES_FOR_THE_ADMIN_PAGE`    | 管理者アクセス許可IP（スペース区切り） |
| `SESSION_DURATION_HOURS`                     | セッション有効時間（時間）        |

### サービスアカウント経由（環境変数不要）

以下はサービスアカウントの権限で自動認証されるため、環境変数の設定は不要。

- **Firebase Admin SDK**: `GOOGLE_CLOUD_PROJECT` が自動設定される
- **Firestore**: Admin SDK 経由でアクセス
- **Firebase Storage**: Admin SDK 経由でアクセス
- **Firebase Auth**: Admin SDK 経由でアクセス

---

## カスタムドメインの設定

### Cloud Run ドメインマッピング

```bash
gcloud beta run domain-mappings create \
  --service=homepage \
  --domain=<YOUR_DOMAIN> \
  --region=asia-northeast1 \
  --project=<PROJECT_ID>
```

表示される DNS レコード（CNAME）をドメインの DNS 設定に登録します。

### Firebase Auth 承認済みドメインの追加

Firebase Console → Authentication → Settings → 承認済みドメイン に以下を追加:
- Cloud Run のサービスURL（`<SERVICE_URL>`）
- カスタムドメイン（`<YOUR_DOMAIN>`、DNS切り替え後）

### Google OAuth 承認済みリダイレクト URI

Google Cloud Console → API とサービス → 認証情報 → OAuth 2.0 クライアント ID に以下のリダイレクト URI を追加:
- `https://<SERVICE_URL>/auth/callback`
- `https://<YOUR_DOMAIN>/auth/callback`（DNS切り替え後）

### Stripe Webhook エンドポイント

DNS 切り替え後、Stripe ダッシュボードで Webhook エンドポイントを更新:
- エンドポイント URL: `https://<YOUR_DOMAIN>/api/stripe/webhook`

---

## Cloud Run と Firebase App Hosting の違い

| 項目                     | Firebase App Hosting（従来）          | Cloud Run（現在）                      |
| ------------------------ | ------------------------------------- | -------------------------------------- |
| デプロイ方法             | Firebase Studio の Publish ボタン     | gcloud CLI                             |
| リージョン               | us-central1                           | asia-northeast1（東京）                |
| クライアントIP取得       | `x-fah-client-ip` ヘッダー           | `x-forwarded-for` ヘッダー            |
| 環境変数管理             | `apphosting.yaml` + Secret Manager    | `--set-env-vars` フラグ               |
| ビルド                   | 自動（push 時）                       | Cloud Build (`cloudbuild.yaml`)        |
| SSL                      | 自動                                  | 自動                                   |
| Firestore レイテンシ     | ~400ms（リージョン間通信）            | ~160ms（同一リージョン）               |

---

## トラブルシューティング

### ビルドが Stripe エラーで失敗する

```
Error: Neither apiKey nor config.authenticator provided to Stripe
```

`src/lib/stripe.ts` で Stripe SDK がモジュールレベルで初期化されていないことを確認。遅延初期化（`getStripe()` 関数）を使用すること。

### ビルドが Firestore タイムアウトで失敗する

```
Failed to build /_not-found after 3 attempts
```

`src/lib/settings.ts` の `getSiteSettings()` にタイムアウト処理があることを確認。ビルド時は Firestore にアクセスできないため、タイムアウト後にデフォルト値にフォールバックする。

### 管理画面にアクセスできない

- `ALLOWED_IP_ADDRESSES_FOR_THE_ADMIN_PAGE` にアクセス元の IPv4 と IPv6 の両方が含まれているか確認
- Cloud Run では `x-forwarded-for` ヘッダーからクライアント IP を取得する（ローカルIPをスキップし、右端から最初のパブリック IP を使用）

### コールドスタートが遅い

- 初回アクセス時は約2〜3秒かかる
- `--min-instances=1` にすることで常時起動を維持できる（課金に注意）

---

## バージョン履歴

| バージョン | 日付       | 変更内容                                              |
| ---------- | ---------- | ----------------------------------------------------- |
| v1         | 2026-04-03 | 初回ビルド（`--build-arg` 非対応で失敗）              |
| v2         | 2026-04-03 | Stripe 遅延初期化対応（Firestore タイムアウトで失敗） |
| v3         | 2026-04-03 | Firestore タイムアウト対応。初回デプロイ成功          |
| v4         | 2026-04-03 | Gemini contentType修正、google_uid保存対応            |
