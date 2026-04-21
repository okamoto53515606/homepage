# 環境変数・シークレット設計書（v2）

本ドキュメントは、v2（AWS 移行後）のアプリケーションに必要な環境変数と
シークレットの一覧・格納先を定義する。

環境変数の一覧は `env_template.txt` を参照。

---

## 格納先の分類

v2 では設定値を以下の 4 箇所に分類して管理する。

| 格納先 | 用途 | 特徴 |
|--------|------|------|
| **`.env`（ローカル）** | 全設定値の単一ソース | セットアップ画面から書き込み。CDK・`next dev` の両方が参照 |
| **Lambda 環境変数** | 非機密の設定値 | CDK が `.env` から読み取り、Lambda に設定。起動時に即参照可能 |
| **Secrets Manager** | Google OAuthとStripe関連 | 管理画面から変更可能。アクセス時に API 呼び出しが必要 |
| **DynamoDB (settings)** | サイト運用設定 | 管理画面から変更可能。決済金額・サイト名等 |

**判断基準**:Google OAuthとStripe関連のパラメータはSecrets Manager、それ以外は Lambda 環境変数または DynamoDB。

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

---

### 5.3. セキュリティ上の注意

- root キーは**有効期限付き**で発行するようセットアップ手順で案内する
- IAM ユーザー作成後は root キーの**無効化**を案内する
- `.env` は `.gitignore` に含まれており、リポジトリにはコミットされない
- `.env` 内の AWS キーは**ローカルマシン上にのみ**存在する

---

## 6. セットアップ状態管理（setup-state.json）

セットアップの進捗管理は `.env` とは別ファイル `setup/setup-state.json` で行う。

### 6.1. `.env` との役割分担

| ファイル | 役割 | 読み取り元 |
|---------|------|-----------|
| `.env` | 設定値（AWS キー、リソース名、API キー） | CDK, `next dev`, AWS SDK |
| `setup-state.json` | セットアップ進捗・エラー履歴 | セットアップ画面 UI, AI |

`.env` に `SETUP_STEP=2` のようなステータス変数を混在させない。
設定値と進捗という異なる関心事を分離する。

### 6.2. ファイル構造

```jsonc
{
  "currentPhase": "setup1a",  // 現在のフェーズ ID
  "phases": {
    "setup0": {
      "status": "completed",             // "not-started" | "in-progress" | "completed"
      "startedAt": "2026-04-19T10:30:00.000Z",
      "completedAt": "2026-04-19T10:30:05.000Z",
      "comment": "AWS root key verified via STS GetCallerIdentity, account 210387976006",
      "errors": []
    },
    "setup1a": {
      "status": "in-progress",
      "startedAt": "2026-04-19T10:35:00.000Z",
      "comment": "CDK deploy 完了（CognitoStack）。Cognito ユーザー作成待ち",
      "errors": []
    },
    "setup1b": { "status": "not-started", "errors": [] },
    "setup1b-iam": { "status": "not-started", "errors": [] },
    "setup2": { "status": "not-started", "errors": [] },
    "setup2b": { "status": "not-started", "errors": [] },
    "setup3": { "status": "not-started", "errors": [] }
  }
}
```

### 6.3. AI サポートのメリット

AI エージェントがセットアップを支援する際、`setup-state.json` を1ファイル読むだけで
全フェーズの進捗、エラー履歴、現在の状態を把握できる。
エラー発生時の `errors` 配列にはタイムスタンプとメッセージが残るため、
トラブルシューティングが容易になる。

---

### 6.4. ローカル開発用 .env の Stripe / Google OAuth キー

`.env` に `STRIPE_SECRET_KEY` や `NEXT_PUBLIC_GOOGLE_CLIENT_ID` 等を記載するが、
これは **CDK が使うものではない**。

- **本番 Lambda**: Secrets Manager から Stripe キー / Google OAuth シークレットを取得
- **ローカル `next dev`**: `.env` から直接読み込み（Stripe サンドボックス / Google OAuth テスト環境）

つまり、ローカルで `next dev` を起動したときに本番の Secrets Manager を参照しないよう、
`.env` にサンドボックス用の値を入れておく設計。本番には影響しない。
