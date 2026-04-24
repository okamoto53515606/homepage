# Copilot Instructions

- 全体概要: docs/blueprint_v2.md
- 環境変数/セットアップ状態管理: docs/secrets-and-env_v2.md
- DB設計書: docs/database-schema_v2.md
- AWS最新情報: MCP（aws-knowledge-mcp-server / brave-search）

## 記述方針（必須）

- ソースコメントは「どう実装するか（How）」だけでなく「なぜそうするか（Why / 目的）」を先に明確に書く。
- CDKソースのコメントでは、構成理由・制約・運用上の意図（例: セキュリティ、循環依存回避、コスト）を明記する。
- gitコミットログは変更内容（How）だけでなく、背景と目的（Why）が第三者に伝わる件名/本文にする。

## AWS 情報の扱い

### 最新情報は aws-knowledge-mcp-server / brave-search で必ず検証する

**why:** AWS は CloudFront OAC・Lambda Function URL・Cognito 等、2023 年以降に仕様や推奨構成が頻繁に更新される領域が多い。LLM
単体の学習知識だけで断言すると、古い・誤った設定を生成して時間を浪費する（本プロジェクトでもOAC の DELETE body 等で実際に時間を失った）。

**ルール:**
- AWS サービスの仕様・制約・ベストプラクティス・API
引数を回答する前に、以下のいずれかで一次情報を確認する:
   - `aws-knowledge-mcp-server`（公式ドキュメント検索、優先）
   - `brave-search`（公式 docs にない実装 Tips、re:Post 等）
- 特に以下のトピックは必ず検証:
   - CloudFront OAC / Lambda Function URL / Lambda Web Adapter
   - Cognito（Hosted UI、MFA、OAuth2 PKCE）
   - VPC Endpoint / PrivateLink 関連

## コーディングルール（禁止事項）

### `"use server"` ディレクティブ禁止（Server Actions 禁止）

**why:** 本プロジェクトは CloudFront OAC + Lambda Function URL（AWS_IAM）構成。Server
Actions は Next.js が生成する内部 POST で動き、viewer が送る `x-amz-content-sha256`と実際の payload hash を一致させられないため、OAC の SigV4 署名検証で必ず 403になる。また攻撃面の最小化・レビュー容易性の観点でも Route Handlerに統一する。

**ルール:**
- `.ts/.tsx/.js/.jsx` のファイル先頭・関数先頭に `"use server"` / `'use server'`を書かない
- サーバー処理は `app/api/**/route.ts` に Route Handler として実装し、クライアントからは`fetchWithSigning()` 経由で呼び出す
- RSC（デフォルトの Server Component）や SSR は自由に使ってよい（GET なので OAC影響なし）

### DELETE リクエストに body を付けない

**why:** CloudFront は DELETE メソッドの body を origin に転送しない仕様。viewer が body 込みで SigV4 署名しても、Lambda 側に届く body は空になるため payloadhash が一致せず 403 になる。

**ルール:**
- DELETE はクエリ文字列（`URLSearchParams`）でパラメータを渡す

## v1 → v2 データ移行手順（本番化時に実行）

**why:** Firebase から AWS へのデータ移行は実行順序が固定しており、毎回思い出すのが無駄なためコマンドを箇条書きで残す。DynamoDB は同一 PK への PutItem が上書きなので再実行でくリーン化できる（users 他の旧キー残存などは事前に手動削除）。

```bash
export AWS_PROFILE=okamo

# 1. Firestore → DynamoDB（settings / articles / article_tags / users / comments / payments + Stripe Secrets）
cd migration_project_v1_to_v2
npx tsx migration_firestore_to_dynamodb.ts

# 2. （初回のみ）GCS → S3: 画像移行
cd /home/workspace/homepage/migration_project_v1_to_v2
npx tsx migration_gcs_to_s3.ts

# 3. 記事本文・imageAssets のメディア URL を CloudFront ドメインに書き換え
cd /home/workspace/homepage
npx tsx setup/scripts/migration_rewrite_media_urls.ts https://<CF_DOMAIN>
#   既存ドメインからの切替は --old-base <旧URL> を付ける
```

## 2026/04/25 引き継ぎメモ

主要機能（記事追加/削除・ログイン・決済・コメント）が v2 で動作確認済み。残タスクは以下:

### 残タスク
- セットアップ画面の未実装分（独自ドメイン切替ステップ等）を完成させる
- 本番化前のセキュリティチェック
- 独自ドメイン切替時: **Proxy Lambda と app Lambda の両方に `CLOUDFRONT_DOMAIN` 環境変数を `upsertLambdaEnv` で書き込む**（キー名は統一済み）

### セキュリティテストの方針（合意済み）
DAST は別途ツールで回す前提。静的＋攻撃観点の単体テストに集中する。
- **SAST/CI**: `semgrep (p/owasp-top-ten)` + `gitleaks` + `eslint-plugin-security` + `npm audit --audit-level=high`
- **攻撃観点の単体テスト (Vitest)**: `/api/**` Route Handler に対し
  - 認証欠落 → 401
  - 権限不足 / 他ユーザーリソース (IDOR) → 403
  - `/api/admin/*` 非 admin → 403
  - Stripe webhook 署名不正 → 400
  - 入力サイズ上限・path traversal・特殊文字

### 既知の注意点（再掲。v2 で実地検証済み）
- DELETE に body を付けない（CloudFront が origin に転送しない → OAC 署名不一致）
- `"use server"` 禁止（Server Actions の内部 POST は OAC 署名不一致で 403）
- Stripe Webhook は Proxy Lambda (`AuthType: NONE`) 経由のみ。Stripe 直 OAC は 403 確定
- CloudFront Cache Key に RSC ヘッダ (`rsc`/`next-router-prefetch`/`next-router-state-tree`/`next-url`/`accept`) を Include 必須
- payments テーブルの id 属性は `payment_id` (snake_case)。過去の `paymentId` 異常レコードは手動削除 → Stripe Resend で再挿入


