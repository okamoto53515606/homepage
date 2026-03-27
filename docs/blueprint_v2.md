# Project: homepage v2（検討中）

## 1. 概要

2027年3月のFirebase Studio終了を受け、v1のインフラ基盤をFirebaseからAWSへ移行する。

**v2の目的：非エンジニアでもセットアップできる仕組みを作る**

v1では「GUIの設定画面が多すぎて詰む」という課題があった。v2ではAWS CDK（インフラのコード化）とGitHub Copilotを活用し、セットアップの自動化を目指す。

---

## 2. v1からの変更点

| 項目 | v1 | v2 | 変更理由 |
| :--- | :--- | :--- | :--- |
| **インフラ** | Firebase | AWS | CDKで設定を自動化できるため |
| **DB** | Firestore | DynamoDB | CDKとの相性が良い |
| **ストレージ** | GCS | S3 | AWS統一 |
| **CDN** | Firebase App Hosting | CloudFront | ミドルウェア経由でもキャッシュ可能（後述） |
| **デプロイ** | 手動設定 + CLI | AWS CDK | AIエージェントにIAMキーを渡して実行させる |
| **管理画面** | 同一ドメイン | `/admin/*` をフォルダで分離 | 認証基盤を分けてセキュリティ向上 |
| **管理者認証** | Firebase Auth（カスタムクレーム） | Cognito | Firebaseを使わないため |
| **利用者認証** | Google OAuth | Google OAuth（継続） | 変更なし（ただしユーザーデータは移行しない） |

---

## 3. CDN対応（v1で断念した課題の解決）

### v1で断念した理由

Firebase App Hostingでは「ミドルウェアを経由するルートはCloud CDNでキャッシュされない」という制約があり、実質的にCDNキャッシュが使えなかった。

### v2での解決方針

CloudFrontには上記の制約がないため、以下の構成でCDNキャッシュを活用できる見込み：

| コンテンツ | キャッシュ | 備考 |
|-----------|----------|------|
| トップページ、無料記事 | ✅ する | 静的部分をCDNエッジでキャッシュ |
| ヘッダー（ログイン状態） | ❌ しない | クライアントからAPIでfetch |
| コメント | ❌ しない | クライアントからAPIでfetch |
| 有料記事本文 | ❌ しない | アクセス権チェック後にAPIでfetch |
| 決済関連 | ❌ しない | 動的処理 |

**補足：** 完全な静的サイトにするわけではない。動的に生成されるページの静的部分がCDNにキャッシュされれば十分。

---

## 4. 認証の設計

| 対象 | 認証方式 | 備考 |
|------|---------|------|
| 利用者（閲覧者） | Google OAuth | ログインのみに利用 |
| 管理者 | Cognito | `/admin/*` へのアクセス時にJWT検証 |

**利用者データの移行について：** v1からのユーザーデータ移行は行わない。新規登録してもらう。（Google OAuthの`sub`は変わらないため、将来必要になれば移行は可能）

---

## 5. セットアップの流れ（想定）

### Phase 0: 人間が行う作業

以下はAIエージェントが代行できないため、手順書を用意する。

1. 独自ドメインの取得
2. AWSアカウント作成とIAMアクセスキー発行
3. Stripeアカウント作成とAPIキー発行
4. VSCode + GitHub Copilotのセットアップ
5. Google OAuth画面の設定

### Phase 1: AIエージェントによる自動構築

Phase 0で取得したAPIキー等をCopilot Agentに渡し、CDKでインフラを構築させる。

---

## 6. 技術構成（現時点の案）

### アーキテクチャ概要

```
[ユーザー] → CloudFront → Lambda Function URL → Lambda (Next.js + Web Adapter)
                ↓
              S3 (静的ファイル)
```

### Lambda Web Adapter 方式を採用

Next.jsアプリをDockerコンテナ化し、Lambda Web Adapterを使ってLambda上で動作させる。

| レイヤー | 技術 | 備考 |
|---------|------|------|
| フロント配信 | CloudFront | OAC + Lambda@Edge でセキュア化 |
| SSR/API | Lambda + Lambda Web Adapter | ECRからコンテナイメージをデプロイ |
| 静的ファイル | S3 | CloudFrontのBehaviorで振り分け |
| DB | DynamoDB | - |
| ストレージ | S3 | - |
| 管理者認証 | Cognito | `/admin/*` へのアクセス時にJWT検証 |
| 利用者認証 | Google OAuth | - |
| 決済 | Stripe | - |
| インフラ管理 | AWS CDK | - |
| コンテナレジストリ | ECR | イメージタグで切り戻し可能 |
| 開発環境 | VSCode + GitHub Copilot + Docker (WSL) | - |

### この方式を選んだ理由

1. **CloudFrontの自由度**: Firebase App Hostingの「ミドルウェア問題」が存在しない
2. **Next.js互換性**: `output: "standalone"` + Lambda Web Adapter で App Router/SSR/ISR が動作
3. **切り戻しの容易さ**: ECRのイメージタグでロールバック可能
4. **透明性**: 仕組みが明確でAIエージェントが把握しやすい
5. **非エンジニア配布**: WSL + Docker環境があれば `docker build` → `docker push` のコピペで済む

### Amplify を使わない理由

AWS Amplifyはセットアップが簡単だが、以下の理由で採用しない：

- **ブラックボックスが多い**: 内部で何が起きているか把握しづらい
- **AIエージェントとの相性**: CDKのように「コードで全てを定義」できないため、エージェントが状況を把握しにくい
- **カスタマイズの制限**: CloudFrontの細かい設定（Behavior、Lambda@Edge等）を自由に制御しづらい

### Lambda コールドスタートについて

| 項目 | 対策 |
|------|------|
| メモリサイズ | 1024MB以上を推奨 |
| アーキテクチャ | ARM64（Graviton）推奨 |
| Provisioned Concurrency | 個人メディア規模では不要（高コスト） |

**補足**: 2025年8月のINIT課金変更でコールドスタートのコストが上がったが、個人メディア規模では影響は軽微。

---

## 7. 機能仕様（v1から継承）

- **コメント機能:** 投稿者の国コード・推定地域・日替わりハッシュIDを表示
- **決済:** Stripe都度課金（少額決済後にN日間見放題）
- **ライセンス:** Unlicense

---

## 8. 参考資料

### Lambda Web Adapter + CloudFront 構成

- [フロントエンド SSR 環境構築の悩みを解決！最新 React Router v7 と Next.js 15 のサーバーレス環境構築方法](https://serverless.co.jp/blog/nwg365t1vv/) - 本構成の元ネタ
- [Lambda Web Adapter でウェブアプリを (ほぼ) そのままサーバーレス化する (2025年改訂版)](https://aws.amazon.com/jp/builders-flash/202301/lambda-web-adapter/) - AWS公式
- [AWSの安価でスケーラブルなウェブアプリ構成 2025年度版](https://tmokmss.hatenablog.com/entry/serverless-fullstack-webapp-architecture-2025) - 同様の構成を採用した事例

### CDK + Next.js

- [cdk-nextjs (cdklabs)](https://github.com/cdklabs/cdk-nextjs) - CDK公式のNext.jsコンストラクト（複雑なので当面は使わない予定）
- [cdk-nextjs (jetbridge)](https://github.com/jetbridge/cdk-nextjs) - コミュニティ版

### Lambda コールドスタート

- [Understanding and Remediating Cold Starts: An AWS Lambda Perspective](https://aws.amazon.com/blogs/compute/understanding-and-remediating-cold-starts-an-aws-lambda-perspective/) - AWS公式ブログ
- **ライセンス:** Unlicense
