# 開発時の運用フロー v2

> why: setup1b（CDK 再デプロイ）は `.env` の `CUSTOM_DOMAIN` /
> `CUSTOM_DOMAIN_CERT_ARN` を CDK context として読み込み、CloudFront の
> `Aliases` / `ViewerCertificate` / Lambda env (`CLOUDFRONT_DOMAIN`) を**保持した
> ままデプロイ**する。setup2b の Phase D-2（CloudFront 紐付け）成功時に同 2 変数
> が `.env` に永続化されるため、その後 setup1b を何度走らせても独自ドメインが
> 剥がれない。両変数が未設定（初回セットアップ時）はデフォルトの cf ドメインに
> フォールバックする。
> ops メニュー（SDK 直接書込み）と setup1b（CDK 再デプロイ）を**目的別に使い分け
> る**ことで、事故を最小化しつつ高速に運用する。

## 変更内容と手順

| 変更内容 | 手順 | 所要時間 |
|---|---|---|
| **コードのみ**（Next.js / API ルート / フロントエンド） | ops →「アプリコード更新」 | 数分 |
| **WAF 切替**（none / ip / captcha） | ops →「WAF 構成変更」 | 3〜10 分 |
| **構造変更**（DynamoDB GSI 追加 / 新 Lambda / IAM ポリシー / CDK スタック修正等） | setup1b で再デプロイ（WAF モードもここで指定すれば WebACLId も復元される。独自ドメインは `.env` 経由で保持される） | 30〜60 分 |

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

## 構造変更フロー（setup1b 再デプロイ）

CDK スタックそのものを更新する場合はこちら。

1. **setup1b** で「インフラ再デプロイ」を実行
   - `.env` の `CUSTOM_DOMAIN` / `CUSTOM_DOMAIN_CERT_ARN` が CDK context に渡るため、
     CloudFront `Aliases` / `ViewerCertificate` / Lambda env `CLOUDFRONT_DOMAIN` は
     **独自ドメイン状態を保ったまま**再デプロイされる（剥がれない）
   - WAF を使う場合は setup1b の WAF モード指定で WebACLId も同時に復元される
2. setup2b Phase D-2「再紐付け」や Phase E「ドメイン書換」は **通常不要**
   - 何らかの理由で `.env` から両変数が失われた場合のみ、Phase D-2 で再紐付け →
     Phase E でドメイン書換を実行する（リカバリ手段として残す）

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
