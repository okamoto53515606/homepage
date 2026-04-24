/**
 * homepage-deployer IAM ユーザー用インラインポリシー定義
 *
 * 目的 (why):
 *   setup0〜setup1c で AWS root アクセスキーを使って作成してきた homepage 関連リソースを、
 *   root キーに代えて権限を絞った IAM ユーザー `homepage-deployer` で引き継いで管理する。
 *   root キー事故（流出・誤操作）で AWS アカウント全体が壊滅するリスクを避けるため、
 *   このユーザーには「homepage 名前空間のリソースだけ操作できる」権限のみを与える。
 *
 * 設計方針:
 *   - 命名/ARN パターンでスコープを絞る（homepage-*, homepage/*, Homepage*Stack）
 *   - 後続フェーズ (setup2b: 独自ドメイン, setup3: Stripe 本番) で必要になる
 *     Route 53 / ACM / CloudFront エイリアス追加 / Cognito コールバック追加 も含める
 *   - 禁止: 請求・Organizations・IAM ユーザー/ロール作成（自分の access key 管理は除く）
 *   - 禁止: 他サービス（EC2, RDS, VPC 作成等）
 *
 *   このポリシーはインラインで貼り付けるため、変更したいときはこのファイルを編集して
 *   再度 /api/iam-setup を叩けば PutUserPolicy で上書きできる。
 */

export const HOMEPAGE_DEPLOYER_USER_NAME = "homepage-deployer";
export const HOMEPAGE_DEPLOYER_POLICY_NAME = "homepage-deployer-policy";

/**
 * インラインポリシードキュメント (JSON.stringify して PutUserPolicy に渡す)。
 * リージョン/アカウントは * を使わずに明示するほうが厳密だが、setup 時に account ID を
 * 取得してテンプレ化するのは複雑なので、リソース名側で十分絞り込めるものは * を許容する。
 */
export const HOMEPAGE_DEPLOYER_POLICY_DOCUMENT = {
  Version: "2012-10-17",
  Statement: [
    // -------------------------------------------------------------------
    // CloudFormation — Homepage* スタックの管理
    //   why: CDK は CloudFormation 経由でデプロイ/破棄する。Homepage* に限定すれば
    //        他のスタックは触れない。
    // -------------------------------------------------------------------
    {
      Sid: "CloudFormationHomepageStacks",
      Effect: "Allow",
      Action: [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DeleteStack",
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DescribeStackResource",
        "cloudformation:DescribeStackResources",
        "cloudformation:GetTemplate",
        "cloudformation:GetTemplateSummary",
        "cloudformation:ListStacks",
        "cloudformation:ListStackResources",
        "cloudformation:ValidateTemplate",
        "cloudformation:CreateChangeSet",
        "cloudformation:DescribeChangeSet",
        "cloudformation:ExecuteChangeSet",
        "cloudformation:DeleteChangeSet",
      ],
      Resource: [
        "arn:aws:cloudformation:*:*:stack/Homepage*/*",
        "arn:aws:cloudformation:*:*:stack/CDKToolkit/*",
      ],
    },
    // CDK bootstrap の事前確認系は ListStacks が必要（全スタック読みになる）
    {
      Sid: "CloudFormationListStacks",
      Effect: "Allow",
      Action: [
        "cloudformation:ListStacks",
        "cloudformation:DescribeStacks",
      ],
      Resource: "*",
    },
    // -------------------------------------------------------------------
    // CDK bootstrap で必要になる SSM パラメータ (cdk-bootstrap/hnb659fds/version)
    // -------------------------------------------------------------------
    {
      Sid: "SsmCdkBootstrap",
      Effect: "Allow",
      Action: [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:PutParameter",
        "ssm:DeleteParameter",
      ],
      Resource: "arn:aws:ssm:*:*:parameter/cdk-bootstrap/*",
    },
    // -------------------------------------------------------------------
    // S3 — media バケット + CDK staging バケット
    //   why: CDK アセット(Docker image 以外) は cdk-hnb659fds-assets-* に置かれる。
    // -------------------------------------------------------------------
    {
      Sid: "S3HomepageBuckets",
      Effect: "Allow",
      Action: "s3:*",
      Resource: [
        "arn:aws:s3:::homepage-media-*",
        "arn:aws:s3:::homepage-media-*/*",
        "arn:aws:s3:::cdk-hnb659fds-assets-*",
        "arn:aws:s3:::cdk-hnb659fds-assets-*/*",
      ],
    },
    // バケット一覧は ListAllMyBuckets が必須 (CDK diff 等で使う)
    {
      Sid: "S3ListAllBuckets",
      Effect: "Allow",
      Action: ["s3:ListAllMyBuckets", "s3:GetBucketLocation"],
      Resource: "*",
    },
    // -------------------------------------------------------------------
    // DynamoDB — homepage-* テーブル
    // -------------------------------------------------------------------
    {
      Sid: "DynamoDbHomepageTables",
      Effect: "Allow",
      Action: "dynamodb:*",
      Resource: [
        "arn:aws:dynamodb:*:*:table/homepage-*",
        "arn:aws:dynamodb:*:*:table/homepage-*/*",
      ],
    },
    // -------------------------------------------------------------------
    // Lambda — homepage-app / homepage-stripe-webhook-proxy
    // -------------------------------------------------------------------
    {
      Sid: "LambdaHomepageFunctions",
      Effect: "Allow",
      Action: "lambda:*",
      Resource: [
        "arn:aws:lambda:*:*:function:homepage-*",
        "arn:aws:lambda:*:*:function:homepage-*:*",
      ],
    },
    {
      Sid: "LambdaListAll",
      Effect: "Allow",
      Action: [
        "lambda:ListFunctions",
        "lambda:GetAccountSettings",
      ],
      Resource: "*",
    },
    // -------------------------------------------------------------------
    // CloudFront — distribution 全操作 (別名追加・キャッシュ無効化含む)
    //   why: CloudFront は ARN だけではリソース絞り込みが弱く、実運用では * が多い。
    //        アカウント単位で homepage しか distribution を作らない想定で * を許容する。
    // -------------------------------------------------------------------
    {
      Sid: "CloudFrontAll",
      Effect: "Allow",
      Action: [
        "cloudfront:*",
      ],
      Resource: "*",
    },
    // -------------------------------------------------------------------
    // WAF v2 — homepage-app-waf / IPSet
    // -------------------------------------------------------------------
    {
      Sid: "Wafv2Homepage",
      Effect: "Allow",
      Action: "wafv2:*",
      Resource: "*",
    },
    // -------------------------------------------------------------------
    // Cognito — 管理者ユーザープール操作 (コールバック URL 追加など)
    // -------------------------------------------------------------------
    {
      Sid: "CognitoIdpAll",
      Effect: "Allow",
      Action: [
        "cognito-idp:*",
      ],
      Resource: "*",
    },
    // -------------------------------------------------------------------
    // Secrets Manager — homepage/* のみ
    // -------------------------------------------------------------------
    {
      Sid: "SecretsManagerHomepage",
      Effect: "Allow",
      Action: "secretsmanager:*",
      Resource: "arn:aws:secretsmanager:*:*:secret:homepage/*",
    },
    // -------------------------------------------------------------------
    // ECR — CDK が作る cdk-hnb659fds-container-assets-* リポジトリ
    //   why: homepage-app Lambda は Docker イメージでデプロイされるため
    //        ECR の push 権限が必須。
    // -------------------------------------------------------------------
    {
      Sid: "EcrCdkAssets",
      Effect: "Allow",
      Action: "ecr:*",
      Resource: "arn:aws:ecr:*:*:repository/cdk-hnb659fds-container-assets-*",
    },
    {
      Sid: "EcrAuth",
      Effect: "Allow",
      Action: [
        "ecr:GetAuthorizationToken",
        "ecr:DescribeRepositories",
      ],
      Resource: "*",
    },
    // -------------------------------------------------------------------
    // CloudWatch Logs
    // -------------------------------------------------------------------
    {
      Sid: "LogsHomepage",
      Effect: "Allow",
      Action: "logs:*",
      Resource: [
        "arn:aws:logs:*:*:log-group:/aws/lambda/homepage-*",
        "arn:aws:logs:*:*:log-group:/aws/lambda/homepage-*:*",
        "arn:aws:logs:*:*:log-group:/aws/cloudfront/*",
      ],
    },
    // -------------------------------------------------------------------
    // IAM — CDK が作る homepage 関連ロールの管理 + PassRole
    //   why: CDK は各 Lambda 用実行ロールを Homepage*Stack 配下に自動生成する。
    //        ロール名は CDK が自動採番するが HomepageDynamoDbStack-* や
    //        HomepageWafStack-* 等プレフィックスでスコープ可能。
    //   禁止: IAM ユーザーの作成/削除（自分自身の access key 管理は例外で許可）
    // -------------------------------------------------------------------
    {
      Sid: "IamCdkRoles",
      Effect: "Allow",
      Action: [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:UpdateRole",
        "iam:UpdateAssumeRolePolicy",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:ListRolePolicies",
        "iam:ListAttachedRolePolicies",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:PassRole",
      ],
      Resource: [
        "arn:aws:iam::*:role/Homepage*",
        "arn:aws:iam::*:role/cdk-hnb659fds-*",
        "arn:aws:iam::*:role/homepage-*",
      ],
    },
    // IAM ポリシー read 系 (CDK diff で必要)
    {
      Sid: "IamRead",
      Effect: "Allow",
      Action: [
        "iam:GetRole",
        "iam:ListRoles",
        "iam:GetPolicy",
        "iam:GetPolicyVersion",
        "iam:ListPolicies",
      ],
      Resource: "*",
    },
    // 自分自身のアクセスキー管理 (ローテーションできるように)
    {
      Sid: "IamSelfAccessKey",
      Effect: "Allow",
      Action: [
        "iam:GetUser",
        "iam:ListAccessKeys",
        "iam:CreateAccessKey",
        "iam:UpdateAccessKey",
        "iam:DeleteAccessKey",
      ],
      Resource: "arn:aws:iam::*:user/homepage-deployer",
    },
    // -------------------------------------------------------------------
    // Route 53 — setup2b (独自ドメイン) で必要
    // -------------------------------------------------------------------
    {
      Sid: "Route53HostedZones",
      Effect: "Allow",
      Action: [
        "route53:CreateHostedZone",
        "route53:DeleteHostedZone",
        "route53:GetHostedZone",
        "route53:ListHostedZones",
        "route53:ListHostedZonesByName",
        "route53:ChangeResourceRecordSets",
        "route53:ListResourceRecordSets",
        "route53:GetChange",
      ],
      Resource: "*",
    },
    // -------------------------------------------------------------------
    // ACM — setup2b (独自ドメイン SSL 証明書)
    // -------------------------------------------------------------------
    {
      Sid: "AcmCertificates",
      Effect: "Allow",
      Action: [
        "acm:RequestCertificate",
        "acm:DescribeCertificate",
        "acm:ListCertificates",
        "acm:DeleteCertificate",
        "acm:AddTagsToCertificate",
      ],
      Resource: "*",
    },
    // -------------------------------------------------------------------
    // STS — aws sts get-caller-identity など基本系
    // -------------------------------------------------------------------
    {
      Sid: "StsBasic",
      Effect: "Allow",
      Action: [
        "sts:GetCallerIdentity",
        "sts:AssumeRole",
      ],
      Resource: "*",
    },
  ],
};
