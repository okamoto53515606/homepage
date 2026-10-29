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
| **障害対応**（502 / サイト停止） | [障害時の切り分け](#障害時の切り分け502--サイト停止) の手順で「誰が返しているか」→ Lambda の状態を確認 | 5〜20 分 |
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

## 障害時の切り分け（502 / サイト停止）

**why:** 2026/10/30 の障害（[20261030_outage_ecr-image-expiry.md](./20261030_outage_ecr-image-expiry.md)）では、CloudFront が返す汎用エラーがアプリのエラーに見えたため初動が遅れた。さらに「コンテナイメージの欠損」は**コードを直しても設定を直しても復旧せず、`cdk deploy` でも直らない**という落とし穴がある。切り分けの型を先に決めておく。

### 1. まず「誰が返しているか」を確認

```bash
curl -sS -o /dev/null -D - https://www.okamomedia.tokyo/ \
  | grep -i -E '^(HTTP|x-cache|x-amzn-errortype|server):'
```

| 観測結果 | 意味 | 次に見るもの |
|---|---|---|
| `502` + `x-amzn-errortype: BadGatewayException` + `x-cache: Error from cloudfront` | Lambda オリジンが正常応答を返していない | Lambda の状態（2.） |
| `5xx` だが `x-cache: Error from cloudfront` ではない | アプリ内のエラー | Lambda のログ |
| `200` だが内容が古い / 空 | キャッシュ or prerender | `x-nextjs-prerender`、invalidate |
| `/media/*` は 200 で `/` だけ 502 | オリジンが2つあるため「Lambda 側だけ死んでいる」典型 | Lambda の状態（2.） |

### 2. Lambda の状態を見る

```bash
aws lambda get-function-configuration --function-name homepage-app \
  --query '{state:State,reason:StateReason,code:StateReasonCode,lastUpdate:LastUpdateStatus}'
```

| `State` / `StateReasonCode` | 意味 | 対処 |
|---|---|---|
| `Inactive` / `ImageDeleted` | **ECR のイメージが削除されている**（2026/10/30 に発生） | 3. の手順で再ビルド → 差し替え |
| `Active` で `LastUpdateStatus=Failed` | デプロイ失敗 | `LastUpdateStatusReason` を確認 |
| `Active` なのに 502 が続く | アプリの起動失敗（環境変数・ポート等） | CloudWatch `/aws/lambda/homepage-app` のログ |

**重要な落とし穴:** `ImageDeleted` のとき `npx cdk diff HomepageDynamoDbStack` は**差分ゼロ**になる。CloudFormation はテンプレート差分が無いと `UpdateFunctionCode` を呼ばないため、**`cdk deploy`（`--force` 含む）では復旧しない**。

### 3. 復旧（ops「アプリコード更新」と同じ経路）

```bash
TAG=ops-$(date +%s)
REPO=210387976006.dkr.ecr.ap-northeast-1.amazonaws.com/cdk-hnb659fds-container-assets-210387976006-ap-northeast-1
aws ecr get-login-password --region ap-northeast-1 \
  | docker login --username AWS --password-stdin "${REPO%%/*}"
# why: Lambda は linux/amd64 必須。マニフェストは index/list 不可（OCI の単一 manifest は可）
docker build --platform linux/amd64 -t "$REPO:$TAG" -f Dockerfile .
docker push "$REPO:$TAG"
aws lambda update-function-code --function-name homepage-app --image-uri "$REPO:$TAG"
aws lambda wait function-updated --function-name homepage-app
```

- Function URL / 環境変数 / IAM / CloudFront（Aliases・証明書・WebACL）には触れない
- 復旧後は `State=Active` とトップページ `200` を必ず実機確認する
- この経路では Lambda の ImageUri が `ops-<epoch>` タグになり、CFN のアセットハッシュとは一致しない（次回の構造変更デプロイで CDK ビルドへ戻る。想定どおりの挙動）

### 4. 再発防止の前提（変えてはいけないこと）

- アセット用 ECR リポジトリはアカウント/リージョン共有（`homepage-app` / `newcleus-app` / `bar-kiln-site`）
- ライフサイクルは CDK bootstrap 既定（`untagged` を 365 日で失効）を維持する。**`tagStatus: any|tagged` の件数・期間ベースのルールを入れると、使用中のイメージが静かに消える**
- 監視アラームは未設定。復旧の初動は現状「利用者の報告」依存であることを前提に置く

## 触ってはいけないもの

| 値 | 管理場所 | 触る場所 |
|---|---|---|
| `Aliases` / `ViewerCertificate` | CloudFront Distribution | setup2b（attach / 再紐付け）のみ |
| Lambda `CLOUDFRONT_DOMAIN` | 両 Lambda の env | setup2b Phase E（ドメイン書換）のみ |
| Cognito Callback URL | UserPoolClient | setup2b Phase E のみ |
| WebACLId | CloudFront Distribution | ops（WAF 構成変更）のみ |
