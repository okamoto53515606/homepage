# 運用フロー v2

> why: setup1b（CDK 再デプロイ）は CloudFront の `Aliases` / `ViewerCertificate` /
> Lambda env (`CLOUDFRONT_DOMAIN`) を **CDK 規定値で上書きしてしまう**ため、独自
> ドメイン運用中は不用意に走らせると独自ドメインが剥がれる。
> ops メニュー（SDK 直接書込み）と setup1b（CDK 再デプロイ）を**目的別に使い分け
> る**ことで、事故を最小化しつつ高速に運用する。

## 変更内容と手順

| 変更内容 | 手順 | 所要時間 |
|---|---|---|
| **コードのみ**（Next.js / API ルート / フロントエンド） | ops →「アプリコード更新」 | 数分 |
| **WAF 切替**（none / ip / captcha） | ops →「WAF 構成変更」 | 3〜10 分 |
| **構造変更**（DynamoDB GSI 追加 / 新 Lambda / IAM ポリシー / CDK スタック修正等） | ① setup1b で再デプロイ（WAF モードもここで指定すれば WebACLId も復元される） → ② setup2b Phase D-2「再紐付け」 → ③ setup2b Phase E「ドメイン書換」 | 30〜60 分 |

## ops メニュー（SDK 直接書込み）

`/setup/ops` で実行。CDK を経由しないため独自ドメイン (`Aliases` /
`ViewerCertificate` / `CLOUDFRONT_DOMAIN`) に**一切触らない**。

- **アプリコード更新**: `docker build` → ECR push → `UpdateFunctionCode`
  - 対象: `homepage-app`（DockerImageFunction）
  - `homepage-stripe-webhook-proxy` は inline コードなので対象外
- **WAF 構成変更**: `WafStack` deploy/destroy + `UpdateDistribution` で WebACLId のみ書き換え
- **CDN キャッシュ削除**: `CreateInvalidation /*`
- **env 同期**: `.env` の SAFE キー（`CLOUDFRONT_DEFAULT_DOMAIN` / `CLOUDFRONT_DISTRIBUTION_ID` / `S3_BUCKET_NAME` / `STRIPE_WEBHOOK_PROXY_URL`）を両 Lambda に push
  - `CLOUDFRONT_DOMAIN`（独自ドメイン）は触らない

## 構造変更フロー（setup1b → setup2b 再紐付け）

CDK スタックそのものを更新する場合のみこちら。

1. **setup1b** で「インフラ再デプロイ」を実行
   - CDK が `Distribution` を再生成し、`Aliases=[]` / `ViewerCertificate=default` /
     Lambda env `CLOUDFRONT_DOMAIN=<default cf domain>` に戻る
2. **setup2b** Phase D-2 →「再紐付け（setup1b 後の復旧用）」ボタン
   - `setup-state.json` の `externalDomain` / `certificateArn` を使って attach API
     を再実行（冪等）。`Aliases` と `ViewerCertificate` が復元される
3. **setup2b** Phase E →「ドメイン書換」を再実行
   - Lambda env `CLOUDFRONT_DOMAIN` を独自ドメインに書き戻す（必須。忘れると
     Cognito callback や各種 URL が default cf domain に向いたままになる）
4. WAF を使う場合は **setup1b の WAF モード指定**で同時に復元される
   （WebACLId も CDK が再 attach するため、ops での再 attach は通常不要）

## 並行実行の注意

- ops の「アプリコード更新」(`UpdateFunctionCode`) と「env 同期」(`UpdateFunctionConfiguration`) を**同時に**走らせると `ResourceConflictException: concurrent update` が出る
  - `upsertLambdaEnv` 側で `LastUpdateStatus=Successful` 待機 + 競合リトライ
    (最大 5 回) を入れているため、env 同期側で自動回復する
  - 心配なら片方完了してから次を実行

## 触ってはいけないもの

| 値 | 管理場所 | 触る場所 |
|---|---|---|
| `Aliases` / `ViewerCertificate` | CloudFront Distribution | setup2b（attach / 再紐付け）のみ |
| Lambda `CLOUDFRONT_DOMAIN` | 両 Lambda の env | setup2b Phase E（ドメイン書換）のみ |
| Cognito Callback URL | UserPoolClient | setup2b Phase E のみ |
| WebACLId | CloudFront Distribution | ops（WAF 構成変更）のみ |
