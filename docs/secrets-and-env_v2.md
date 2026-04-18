# 環境変数・シークレット設計書（v2）

本ドキュメントは、v2（AWS 移行後）のアプリケーションに必要な環境変数と
シークレットの一覧・格納先・IAM 権限を定義する。

v1 の環境変数は `env_template.txt` を参照。

---

## 格納先の分類

v2 では設定値を以下の 4 箇所に分類して管理する。

| 格納先 | 用途 | 特徴 |
|--------|------|------|
| **`.env`（ローカル）** | 全設定値の単一ソース | セットアップ画面から書き込み。CDK・`next dev` の両方が参照 |
| **Lambda 環境変数** | 非機密の設定値 | CDK が `.env` から読み取り、Lambda に設定。起動時に即参照可能 |
| **Secrets Manager** | 機密性の高い API キー等 | 管理画面から変更可能。アクセス時に API 呼び出しが必要 |
| **DynamoDB (settings)** | サイト運用設定 | 管理画面から変更可能。決済金額・サイト名等 |

**判断基準**: 漏洩時にセキュリティリスクがあるものは Secrets Manager、
それ以外は Lambda 環境変数または DynamoDB。

### `.env` を単一ソースとする設計方針

セットアップ画面（ローカル VSCode）から設定値を書き込む先として `.env` を採用する。

```
[セットアップ画面 (VSCode)]
    │
    ▼  書き込み
  .env（単一ソース）
    │
    ├── next dev → Next.js がネイティブ読み込み
    ├── cdk deploy → dotenv で読み込み → Lambda 環境変数に設定
    └── AWS SDK → AWS_ACCESS_KEY_ID / SECRET を自動認識
```

**`.env` を選んだ理由:**

| 観点 | `.env` | `cdk.json` context | 独自 JSON |
|------|--------|-------------------|-----------|
| Next.js ローカル開発 | ネイティブ対応 | 読めない（ラッパー必要） | ラッパー必要 |
| CDK から参照 | `dotenv` 1行で対応 | ネイティブ対応 | カスタムローダー必要 |
| セットアップ画面から書き込み | key=value で簡単 | JSON 操作 | JSON 操作 |
| `.gitignore` | 標準的に除外済み | 通常コミット対象 | 設定が必要 |
| AWS SDK 自動認識 | `AWS_ACCESS_KEY_ID` 等を自動認識 | 不可 | 不可 |

**CDK 側の読み込み例:**

```typescript
import * as dotenv from 'dotenv';
dotenv.config(); // プロジェクトルートの .env を読み込み

const fn = new lambda.Function(this, 'NextApp', {
  environment: {
    TABLE_PREFIX: process.env.TABLE_PREFIX!,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY!,
    // ... .env から読み取って Lambda 環境変数に設定
  },
});
```

---

## 1. `.env` ファイル構成

セットアップ画面が書き込み、CDK と `next dev` が読み込む。

### 1.0. AWS 認証（セットアップ専用）

セットアップ画面が CDK デプロイ・IAM ユーザー作成等に使用する。
本番 Lambda には設定しない。

| 変数名 | 値の例 | 説明 |
|--------|--------|------|
| `AWS_ACCESS_KEY_ID` | `AKIA...` | AWS アクセスキー |
| `AWS_SECRET_ACCESS_KEY` | `xxxx...` | AWS シークレットキー |
| `AWS_REGION` | `ap-northeast-1` | リージョン |

> **AWS キー管理フロー**: 詳細は後述の「5. AWS アクセスキーの管理フロー」を参照。

### 1.1. AWS リソース参照（CDK → Lambda 環境変数）

### 1.1. AWS リソース参照（CDK → Lambda 環境変数）

| 変数名 | 値の例 | 説明 |
|--------|--------|------|
| `AWS_REGION` | `ap-northeast-1` | リージョン（Lambda ランタイムが自動設定） |
| `TABLE_PREFIX` | `homepage-` | DynamoDB テーブル名プレフィックス |
| `S3_BUCKET_NAME` | `homepage-media-xxxxx` | メディアファイル格納用 S3 バケット名 |

### 1.2. 認証関連

| 変数名 | 値の例 | 説明 |
|--------|--------|------|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | `115488...apps.googleusercontent.com` | Google OAuth クライアントID（セットアップ時に入力） |
| `COGNITO_USER_POOL_ID` | `ap-northeast-1_xxxxxx` | Cognito ユーザープールID（CDK が自動書き込み） |
| `COGNITO_CLIENT_ID` | `xxxxxxxxxxxxxxxxx` | Cognito アプリクライアントID（CDK が自動書き込み） |

### 1.3. AI（Gemini）

| 変数名 | 値の例 | 説明 |
|--------|--------|------|
| `GEMINI_API_KEY` | `AIzaSy...` | Gemini API キー（セットアップ時に入力） |

> **補足**: Gemini API キーは Secrets Manager に入れるべきかの検討余地あり。
> ただし記事生成のみに使用し、管理画面から変更する需要が低いため、
> 当面は Lambda 環境変数とする。変更時は CDK 再デプロイが必要。

### 1.4. アプリケーション設定

| 変数名 | 値の例 | 説明 |
|--------|--------|------|
| `NODE_ENV` | `production` | 実行環境 |
| `STRIPE_TERMS_OF_SERVICE_ENABLED` | `1` | Stripe 決済画面で利用規約同意を表示 |
| `CSP_REPORT_ONLY` | `false` | CSP を検知のみモードにするか |

### 1.5. v1 から削除する環境変数

v2 では以下の環境変数は不要になる。

| 変数名 | 削除理由 |
|--------|---------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase 不使用 |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase 不使用 |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase 不使用 |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase 不使用 |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase 不使用 |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase 不使用 |
| `GOOGLE_APPLICATION_CREDENTIALS` | Firebase Admin SDK 不使用 |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Firebase Admin SDK 不使用 |
| `ALLOWED_IP_ADDRESSES_FOR_THE_ADMIN_PAGE` | WAF IP 制限に移行 |
| `STRIPE_SECRET_KEY` | Secrets Manager に移行 |
| `STRIPE_WEBHOOK_SECRET` | Secrets Manager に移行 |
| `NEXT_PUBLIC_STRIPE_PUBLIC_KEY` | Secrets Manager に移行 |
| `STRIPE_TAX_RATES` | Secrets Manager に移行 |

### 1.6. Stripe（ローカル開発用）

ローカル `next dev` 時に `.env` から直接参照する。本番 Lambda には設定しない（Secrets Manager から取得）。

| 変数名 | 値の例 | 説明 |
|--------|--------|------|
| `STRIPE_SECRET_KEY` | `sk_test_...` | Stripe API シークレットキー |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Webhook 署名シークレット |
| `NEXT_PUBLIC_STRIPE_PUBLIC_KEY` | `pk_test_...` | Stripe 公開可能キー |
| `STRIPE_TAX_RATES` | `txr_...` | 税率 ID |

> ローカルと本番で読み込み元が異なる。アプリコード側の分岐は「2.1. ローカル/本番の参照先分岐」を参照。

---

## 2. AWS Secrets Manager

管理画面から設定・変更できるシークレットを格納する。
Lambda からは AWS SDK で取得する。

### 2.1. `homepage/stripe-config`

Stripe の API キーと Webhook シークレットをまとめて 1 つのシークレットに格納する。

- **シークレット名**: `homepage/stripe-config`
- **リージョン**: `ap-northeast-1`
- **形式**: JSON 文字列

#### 格納するキー

| キー名 | 説明 | 値の例 |
|--------|------|--------|
| `STRIPE_SECRET_KEY` | Stripe API シークレットキー | `sk_test_...` / `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Webhook 署名シークレット | `whsec_...` |
| `NEXT_PUBLIC_STRIPE_PUBLIC_KEY` | Stripe 公開可能キー | `pk_test_...` / `pk_live_...` |
| `STRIPE_TAX_RATES` | 税率 ID | `txr_...` |

#### JSON 形式

```json
{
  "STRIPE_SECRET_KEY": "sk_test_...",
  "STRIPE_WEBHOOK_SECRET": "whsec_...",
  "NEXT_PUBLIC_STRIPE_PUBLIC_KEY": "pk_test_...",
  "STRIPE_TAX_RATES": "txr_..."
}
```

#### 利用箇所

| アプリ側の処理 | 使用するキー | タイミング |
|---------------|-------------|-----------|
| Stripe SDK 初期化 (`src/lib/stripe.ts`) | `STRIPE_SECRET_KEY` | Stripe API 呼び出し時 |
| Webhook 署名検証 (`/api/stripe/webhook`) | `STRIPE_WEBHOOK_SECRET` | Webhook 受信時 |
| Checkout セッション作成 (`/api/stripe/checkout`) | `STRIPE_TAX_RATES` | 決済セッション作成時 |
| クライアント公開キー取得 (`/api/stripe/config`) | `NEXT_PUBLIC_STRIPE_PUBLIC_KEY` | 決済画面表示時 |
| 管理画面 Stripe 設定 (`/api/admin/stripe-config`) | 全キー | 設定の表示・更新時 |

#### アクセス方法（アプリケーションコード）

```typescript
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

// キャッシュ（Lambda のライフサイクル内で再利用）
let cachedStripeConfig: Record<string, string> | null = null;

export async function getStripeConfig(): Promise<Record<string, string>> {
  if (cachedStripeConfig) return cachedStripeConfig;

  const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: 'homepage/stripe-config' })
  );
  cachedStripeConfig = JSON.parse(response.SecretString!);
  return cachedStripeConfig!;
}
```

> **キャッシュの注意点**: Lambda のインスタンスが再利用される限りキャッシュが有効。
> 管理画面から Stripe 設定を変更した場合、次回のコールドスタートまで反映されない。
> 即時反映が必要な場合はキャッシュに TTL を設ける（例: 5 分）。

#### ローカル/本番の参照先分岐

| 環境 | 読み込み元 |
|------|-----------|
| ローカル開発 (`next dev`) | `.env` から `process.env.STRIPE_SECRET_KEY` |
| 本番 Lambda | Secrets Manager から `getStripeConfig()` |

アプリコード側で環境に応じて分岐する:

```typescript
async function getStripeSecretKey(): Promise<string> {
  if (process.env.NODE_ENV !== 'production') {
    return process.env.STRIPE_SECRET_KEY!; // ローカル: .env
  }
  const config = await getStripeConfig(); // 本番: Secrets Manager
  return config.STRIPE_SECRET_KEY;
}
```

### 2.2. 将来のシークレット（参考）

| シークレット名 | 用途 | 追加タイミング |
|---------------|------|---------------|
| `homepage/google-oauth` | Google OAuth クライアントシークレット | 必要に応じて |

---

## 3. IAM 権限設計

Lambda に付与する IAM ポリシーを定義する。

### 3.1. メイン Lambda（Next.js アプリ）

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DynamoDBAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchGetItem",
        "dynamodb:BatchWriteItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:ap-northeast-1:*:table/homepage-*",
        "arn:aws:dynamodb:ap-northeast-1:*:table/homepage-*/index/*"
      ]
    },
    {
      "Sid": "SecretsManagerRead",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:ap-northeast-1:*:secret:homepage/*"
    },
    {
      "Sid": "S3MediaAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::homepage-media-*/*"
    }
  ]
}
```

### 3.2. 管理画面 API（追加権限）

管理画面の Stripe 設定更新 API のみ、Secrets Manager への書き込み権限を付与する。

> **実装方針**: v2 ではメイン Lambda が 1 つなので、管理画面 API のエンドポイント内で
> Cognito JWT の管理者判定を行った上で `PutSecretValue` を呼び出す。
> Lambda レベルでの権限分離は将来の課題。

```json
{
  "Sid": "SecretsManagerWrite",
  "Effect": "Allow",
  "Action": [
    "secretsmanager:PutSecretValue"
  ],
  "Resource": "arn:aws:secretsmanager:ap-northeast-1:*:secret:homepage/stripe-config-*"
}
```

### 3.3. Webhook Proxy Lambda

Stripe Webhook を CloudFront OAC 経由で転送するための Proxy Lambda。
最小権限（Lambda Function URL のみ、AWS リソースへのアクセス不要）。

```json
{
  "Version": "2012-10-17",
  "Statement": []
}
```

> Proxy Lambda は Stripe からのリクエストを転送するだけなので、
> AWS リソースへのアクセス権限は不要。

---

## 4. セットアップステップとの対応

各セットアップステップで設定される値の対応表。

| ステップ | 設定される値 | 格納先 |
|----------|-------------|--------|
| **setup0** | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | `.env`（セットアップ画面から入力） |
| **setup1a** | `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` | `.env`（CDK が自動書き込み）→ Lambda 環境変数 |
| **setup1b** | `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `GEMINI_API_KEY`, `TABLE_PREFIX`, `S3_BUCKET_NAME` | `.env`（セットアップ画面から入力）→ Lambda 環境変数 |
| **setup1b 後** | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` を IAM ユーザーキーに差し替え | `.env`（セットアップ画面が自動差し替え） |
| **setup2** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLIC_KEY`, `STRIPE_TAX_RATES` | Secrets Manager（管理画面から入力） |
| **setup2b** | ドメイン関連（CDK パラメータ） | `.env` / CDK コンテキスト |
| **setup3** | Stripe 本番キーで上書き | Secrets Manager（管理画面から入力） |

---

## 5. AWS アクセスキーの管理フロー

セットアップ画面でのAWSキーのライフサイクルを定義する。

### 5.1. フロー概要

```
1. ユーザー: AWS コンソールで root の有効期限付きアクセスキーを発行
   ↓
2. セットアップ画面: root キーを .env に書き込み
   ↓
3. セットアップ画面: root キーで CDK デプロイ（setup1a, 1b）
   ↓
4. セットアップ画面: 「IAMユーザー作成」
   → AWS SDK で IAM ユーザー + アクセスキーを自動作成
   → .env の AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY を差し替え
   ↓
5. セットアップ画面: 案内表示「AWS コンソールで root キーを無効化してください」
   ↓
6. 以降の cdk deploy は IAM ユーザーキーで実行
```

### 5.2. IAM ユーザーの権限

セットアップ画面が作成する IAM ユーザーには、CDK デプロイに必要な権限を付与する。

| 項目 | 値 |
|------|----|
| ユーザー名 | `homepage-deployer`（仮） |
| ポリシー | CDK デプロイに必要な最小権限（詳細は CDK 構築フェーズで確定） |

### 5.3. セキュリティ上の注意

- root キーは**有効期限付き**で発行するようセットアップ手順で案内する
- IAM ユーザー作成後は root キーの**無効化**を案内する
- `.env` は `.gitignore` に含まれており、リポジトリにはコミットされない
- `.env` 内の AWS キーは**ローカルマシン上にのみ**存在する
