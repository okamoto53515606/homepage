# Copilot Instructions

- 全体概要: docs/blueprint_v2.md
- 環境変数/セットアップ状態管理: docs/secrets-and-env_v2.md
- DB設計書: docs/database-schema.md
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

### DB 参照のあるページは `force-dynamic` を必ず付与

**why:** Next.js 16 は `cookies()`/`headers()` を使わない RSC をビルド時に SSG する。DynamoDB 参照ページを SSG させると「ビルド時の DB 状態（≒空）」の HTML が Lambda イメージに焼き付き、その後 DB を更新しても永久に古い HTML が返る（症状: `x-nextjs-prerender: 1` + 空コンテンツ。CDN invalidate しても解消しない）。

**ルール:**
- `getSiteSettings()` 等 DB を参照する Server Component には `export const dynamic = 'force-dynamic'` を入れる
- CDN 側 (`s-maxage`) で性能はカバーされるためコストは軽微

### CloudFront は IPv4 限定運用

**why:** WAF IPSet を IPv4 のみで管理する方針。CDN が IPv6 で受けると WAF の IP 制限を回避してしまうため。

**ルール:**
- CDK の `Distribution` で `enableIpv6: false`
- 入力された IPv6（`:` を含むアドレス）は IPSet に登録しない

### WAF v2 (CLOUDFRONT scope) は不要なら必ず destroy

**why:** WebACL は存在するだけで月額固定料金（約 $5）が発生。`wafMode='none'` でデプロイをスキップしても残置スタックは課金され続ける。

**ルール:**
- `wafMode='none'` 選択時は InfraStack 更新（`webAclId=undefined`）後に `cdk destroy HomepageWafStack` を実行する順序

## 2026/04/25 引き継ぎメモ

主要機能（記事追加/削除・ログイン・決済・コメント）が v2 で動作確認済み。独自ドメイン切替（`www.okamomedia.tokyo`）まで完了し、開発時の運用フローは [docs/operations_v2.md](../docs/operations_v2.md) に集約。

### 既知の注意点（再掲。v2 で実地検証済み）
- DELETE に body を付けない（CloudFront が origin に転送しない → OAC 署名不一致）
- `"use server"` 禁止（Server Actions の内部 POST は OAC 署名不一致で 403）
- Stripe Webhook は Proxy Lambda (`AuthType: NONE`) 経由のみ。Stripe 直 OAC は 403 確定
- CloudFront Cache Key に RSC ヘッダ (`rsc`/`next-router-prefetch`/`next-router-state-tree`/`next-url`/`accept`) を Include 必須
- payments テーブルの id 属性は `payment_id` (snake_case)。過去の `paymentId` 異常レコードは手動削除 → Stripe Resend で再挿入

## 2026/05/02 引き継ぎメモ（セキュリティテスト基盤導入）

**why（背景）:** デプロイ後にしか気づけないクラスの障害（OAC 署名不一致、RSC キャッシュキー漏れ、Cognito 認証ゲート消失、Stripe Webhook 署名検証バイパス）を Pull Request 段階で止めるため、Vitest による攻撃観点の単体テストと GitHub Actions による SAST/秘密情報/依存脆弱性ゲートを導入した。

### テスト構成
- フレームワーク: **Vitest** (node 環境、`@/*` alias、`vi.mock` で `auth`/`dynamodb`/`stripe` を stub)
- 設定: [vitest.config.ts](../vitest.config.ts) / [test/setup.ts](../test/setup.ts)
- 実行: `npm test` (CI), `npm run test:watch` (開発時)
- 現在 19 テスト全 green:
  - [test/api/admin-auth-gate.test.ts](../test/api/admin-auth-gate.test.ts) — Cognito 未認証 → 403、ID 欠落 → 400
  - [test/api/comments.test.ts](../test/api/comments.test.ts) — 401/Zod 検証 (1000 文字上限・空文字・JSON 不正)
  - [test/api/stripe-webhook.test.ts](../test/api/stripe-webhook.test.ts) — 署名ヘッダ無 400、署名不正 400、正常 200
  - [test/api/auth-google-callback.test.ts](../test/api/auth-google-callback.test.ts) — PKCE state mismatch、Google error
  - [test/cdk/distribution.test.ts](../test/cdk/distribution.test.ts) — IPv6 無効、`/api/*` = `CachingDisabled`、RSC ヘッダが Cache Key に含まれる

### CI 構成
[.github/workflows/security.yml](workflows/security.yml) で push/PR 時に 5 ジョブ並列実行:
1. `unit-tests` (Vitest)
2. `lint` (ESLint)
3. `npm-audit` — homepage は `--omit=dev --audit-level=high`、setup は通常 `--audit-level=high`
4. `semgrep` (`p/owasp-top-ten` + `p/typescript`、SARIF アップロード)
5. `gitleaks` (秘密情報スキャン)

### 依存方針
- **homepage**: `--omit=dev` で production high+ = 0。dev/transitive moderate 28 件は許容（genkit / googleapis 経由で本番経路に攻撃面なし）
- **setup**: `postcss` を `overrides` で 8.5.10 に固定し vulnerabilities = 0
- **削除済み**: `genkit-cli`（ローカル AI Developer UI 用、未使用）と `src/ai/dev.ts`
- **保持**: `ts-node` / `source-map-support` は `cdk.json` の `npx ts-node ...` 起動に必要なので残す

### 新しい Route Handler を追加するときの最低ライン
1. `src/app/api/**/route.ts` を作成（`"use server"` 禁止、DELETE は body 無し）
2. `test/api/<area>.test.ts` に最低「未認証/権限不足 → 401/403」を 1 件追加
3. `npm test` がローカルで通ることを確認してから commit

### CI 周りでユーザーが今後やる作業（未実施）
- GitHub Settings → Actions → Workflow permissions = **Read and write**（SARIF 用）
- Branch protection (`main`) で 5 ジョブを Required status checks に登録
- 任意: Dependabot alerts / security updates を ON

### カバーしていない領域（将来やる候補）
- DAST（OWASP ZAP を AWS test 環境に向ける）
- Stripe checkout の userId 改ざん検証（現状 webhook 側で正規化）
- Cognito MFA 設定の手動レビュー（Hosted UI 側の挙動）
