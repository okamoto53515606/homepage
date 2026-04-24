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

