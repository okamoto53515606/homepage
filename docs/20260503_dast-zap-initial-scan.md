# 2026/05/03 DAST (OWASP ZAP) スキャン結果サマリ

## why（背景）

[.github/copilot-instructions.md](../.github/copilot-instructions.md) の「将来やる候補」に記載していた DAST 基盤を 2026/05/02 に整備し、AWS test 環境（`https://test.okamomedia.tokyo`）に対して OWASP ZAP `full-scan` を初めて完走させた。本ドキュメントはその初回結果と判定（False Positive / 受容 / 要対応）を記録する。

HTML 生レポート (`zap-reports/`) は URL/Cookie/JWT が含まれ得るため git 管理しない方針 ([.gitignore](../.gitignore))。

## 実行環境

- ZAP Version: 2.17.0 (`zaproxy/zap-stable` Docker image)
- スキャン種別: Full Scan ([scripts/dast/zap-full-scan.sh](../scripts/dast/zap-full-scan.sh))
- 対象: `https://test.okamomedia.tokyo/`
- 認証: 未認証スキャン（`SESSION_JWT` 未指定）
- ルール抑制: [scripts/dast/zap.conf](../scripts/dast/zap.conf) 適用（commit `e71bfba`）
- 生成日時: 2026-05-03 08:58:47 UTC

## サマリ

| Risk | 件数 | コメント |
| --- | --- | --- |
| **High** | **0** | ✅ 抑制反映後、High はゼロ |
| Medium | 6 | 全件 `accounts.google.com` 由来（自サイト由来 0） |
| Low | 17 | セキュリティヘッダ未設定が中心。今後の改善対象 |
| Informational | 9 | 統計情報のみ |

スキャン規模:

| Site | Endpoints |
| --- | --- |
| `https://test.okamomedia.tokyo` | 1,224 |
| `https://accounts.google.com` | 2 |
| `https://csp.withgoogle.com` | 1 |
| `https://www.gstatic.com` | 2 |
| `https://fonts.gstatic.com` | 1 |
| `https://lh3.googleusercontent.com` | 1 |

## High 警告（0 件）

抑制前の初回スキャン（commit `eac00f1` 段階）では SQL Injection High 7 件が検出されたが、すべて False Positive と判定し commit `e71bfba` で IGNORE 化。判定根拠は次節を参照。

### why（False Positive 判定の根拠）

本プロジェクトは **DynamoDB (NoSQL) のみ** で SQL DB を一切使用しない。ZAP の Boolean-based SQLi 検出（Plugin 40018）は `AND 1=1` / `AND 1=2` を注入してレスポンス差分の有無で判定するが、SQL 以外の理由でレスポンスが変わるケース（Cognito リダイレクト URL 長の差・認証失敗時のエラーレスポンス差・クエリ値の HTML 反映 等）でも誤検出する既知の弱点がある。SQL クエリを組み立てていない以上、攻撃自体が成立しない。

検出された 7 件と実際の挙動:

| エンドポイント | 実装 |
| --- | --- |
| `DELETE /api/admin/articles?id=...` | DynamoDB `DeleteCommand`（KeyCondition 完全一致） |
| `DELETE /api/admin/comments?id=&articleId=...` | DynamoDB `DeleteCommand` |
| `GET /api/admin/auth/callback?code=...&error=...` | Cognito Token Endpoint へ転送、エラー時はリダイレクト |
| `GET /api/auth/google/callback?code=...&state=...` | state/PKCE 検証、検証失敗で 400 |
| `GET /api/auth/google/start?returnTo=...` | `returnTo` を Google OAuth URL に組み立ててリダイレクト |
| `GET /auth/callback?error=...` | エラー文言を HTML に表示 |

再評価が必要になるのは「将来 SQL DB を導入したとき」のみ。その際は [scripts/dast/zap.conf](../scripts/dast/zap.conf) から `40018` 行を削除して再スキャンする。

## Medium 警告（6 件）

すべて `accounts.google.com`（Google ログイン画面）由来で、Google 側のレスポンスに対する指摘。

| Plugin | Alert | Instances | 判定 |
| --- | --- | --- | --- |
| 10055 | CSP: Failure to Define Directive with No Fallback | 2 | Google 側 → 受容 |
| 10055 | CSP: Wildcard Directive | 2 | Google 側 → 受容 |
| 10055 | CSP: script-src unsafe-eval | 1 | Google 側 → 受容 |
| 10055 | CSP: script-src unsafe-inline | 1 | Google 側 → 受容 |
| 10055 | CSP: style-src unsafe-inline | 2 | Google 側 → 受容 |
| 90003 | Sub Resource Integrity Attribute Missing | 1 | Google 側 → 受容 |

### why（受容理由）

ZAP の Spider は OAuth リダイレクトを follow するため `accounts.google.com` まで遷移する。Google 側 CSP の調整は当方で実施不可能なため、本プロジェクトでは受容。

なお [scripts/dast/zap.conf](../scripts/dast/zap.conf) で Plugin 10055 / 90003 を IGNORE に設定済みだが、本スキャン結果には残っている。これは「IGNORE 設定がレポート段階の一覧表からは除外されない（しきい値判定にだけ効く）」ため。**FAIL-NEW=0 / WARN-NEW のしきい値判定上は無視されている**ので、CI 化したときも fail にはならない。

将来 `test.okamomedia.tokyo` 自身に CSP ヘッダを追加した時点で、Plugin 10055 全体 IGNORE はやめてドメイン別に細粒度で設定し直す。

## Low 警告（17 件）— 今後の改善候補

| Alert | Instances | 推奨対応 |
| --- | --- | --- |
| Strict-Transport-Security Header Not Set | Systemic | CloudFront ResponseHeadersPolicy で HSTS 追加 |
| X-Content-Type-Options Header Missing | Systemic | 同上で `nosniff` 追加 |
| Cross-Origin-Resource-Policy Header Missing or Invalid | Systemic | 同上で CORP 追加 |
| Cross-Origin-Embedder-Policy Header Missing or Invalid | 2 | 必要に応じ COEP 追加 |
| Cross-Origin-Opener-Policy Header Missing or Invalid | 2 | 必要に応じ COOP 追加 |
| Permissions Policy Header Not Set | 2 | 同上で Permissions-Policy 追加 |
| Server Leaks Information via "X-Powered-By" | 2 | Lambda Function URL のレスポンスから除去（next.config の `poweredByHeader: false` 等） |
| Cookie No HttpOnly Flag | 4 | `session` 以外で生 cookie を発行している箇所を確認 |
| Cookie Without Secure Flag | 4 | 同上 |
| Cookie without SameSite Attribute | 6 | 同上 |
| Cross-Domain JavaScript Source File Inclusion | 1 | 外部 JS の読込み箇所を確認（必要なら SRI 付与） |
| Dangerous JS Functions | 1 | `eval` / `Function()` 等の使用箇所を確認 |
| Application Error Disclosure | 1 | `/api/stripe/session?session_id=session_id` が 500 を返している件と同根因の可能性。要調査 |
| A Server Error response code was returned by the server | 2 | 同上 |
| Unexpected Content-Type was returned | 287 | Active Scan の探索ノイズが大半。要 triage |
| Timestamp Disclosure - Unix | 1 | レスポンス内の Unix timestamp が機微情報か確認 |
| CSP: Notices | 2 | 自前 CSP 導入時に解消 |

これらは別 issue/commit に分けて段階的に対応する。最低限 **HSTS / X-Content-Type-Options / X-Powered-By 除去** は CloudFront 側 `ResponseHeadersPolicy` 一発で潰せるので優先度高。

## 既知の事象（要調査）

- `GET /api/stripe/session?session_id=session_id` が **500 Internal Server Error** を返す。Stripe API がモック値で throw した例外を catch しきれていない可能性。本来は Zod 検証 or try/catch で 400 に変換すべき。
- `Unexpected Content-Type was returned` が 287 件 — Active Scan で API に HTML/誤った Content-Type を送ってサーバー応答を誘発しているノイズ系の可能性が高い。

## 次のアクション候補

1. **CloudFront ResponseHeadersPolicy に HSTS / nosniff / Referrer-Policy / Permissions-Policy を追加**（CDK 修正 1 commit 想定）
2. **`/api/stripe/session` 500 → 400 修正**（Zod or try/catch）
3. **Cookie 関連 Low 警告の triage**（4/4/6 件のうち self-issued cookie がどれか確認）
4. **将来の CSP 導入** — 自前ドメインに CSP を載せたら zap.conf の Google 抑制ルールを細粒度化

## 関連 commit

- `eac00f1` — DAST infrastructure (OpenAPI seed + scan scripts)
- `e71bfba` — SQLi false positive 抑制 / Google CSP 抑制

## 2026/05/04 対応分

- **CloudFront ResponseHeadersPolicy 新設** (cdk/lib/infra-stack.ts) — HSTS / X-Content-Type-Options / Referrer-Policy / X-Frame-Options / Cross-Origin-Resource-Policy / Cross-Origin-Opener-Policy / Permissions-Policy を全 Behavior に付与
- **`poweredByHeader: false`** (next.config.ts) — X-Powered-By 漏洩抑止
- **`/api/stripe/session` 500 → 400** (src/app/api/stripe/session/route.ts) — `cs_(live|test)_xxx` 形式の事前バリデーションと `StripeInvalidRequestError` の catch で 400 化
- **回帰テスト** — test/cdk/distribution.test.ts に SecurityHeadersPolicy アサーション 2 件、test/api/stripe-session.test.ts 新設

`cdk deploy HomepageInfraStack` 後に再度 ZAP full-scan を流して残 Low 警告を再評価予定。
