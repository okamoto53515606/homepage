import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as path from 'path';
import { Construct } from 'constructs';

/**
 * InfraStack（旧 DynamoDbStack）
 *
 * setup1b でデプロイするメインインフラスタック。
 *
 * リソース:
 *   - DynamoDB テーブル群 (7テーブル)
 *   - S3 メディアバケット
 *   - Lambda (Next.js + Lambda Web Adapter、Docker イメージ)
 *   - CloudFront ディストリビューション (Lambda origin + S3 /media/* behavior)
 *   - Secrets Manager (homepage/google-oauth-config, homepage/stripe-config)
 *
 * CDK コンテキスト:
 *   - cognitoUserPoolId: Cognito User Pool ID (.env の COGNITO_USER_POOL_ID)
 *   - cognitoClientId:   Cognito Client ID (.env の COGNITO_CLIENT_ID)
 *   - cognitoDomain:     Cognito Hosted UI ドメイン (.env の COGNITO_DOMAIN)
 *   - wafAclArn:         WAF Web ACL ARN (HomepageWafStack の出力)
 *
 * テーブル設計: docs/database-schema_v2.md
 *
 * 全テーブル共通:
 *   - プレフィックス: homepage-
 *   - 容量モード: PAY_PER_REQUEST
 *   - PITR: 有効
 *   - 削除保護: RETAIN
 */
export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // CDK context 値 (setup1b の cdk-deploy-1b API から --context で渡される)
    const cognitoUserPoolId = (this.node.tryGetContext('cognitoUserPoolId') as string) ?? '';
    const cognitoClientId = (this.node.tryGetContext('cognitoClientId') as string) ?? '';
    const cognitoDomain = (this.node.tryGetContext('cognitoDomain') as string) ?? '';
    const wafAclArn = (this.node.tryGetContext('wafAclArn') as string) ?? undefined;

    const prefix = 'homepage-';

    // =========================================================
    // 1. settings テーブル
    // =========================================================
    const settingsTable = new dynamodb.Table(this, 'SettingsTable', {
      tableName: `${prefix}settings`,
      partitionKey: { name: 'config_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // =========================================================
    // 2. articles テーブル
    // =========================================================
    const articlesTable = new dynamodb.Table(this, 'ArticlesTable', {
      tableName: `${prefix}articles`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GSI1: status + createdAt でソート（記事一覧取得用）
    articlesTable.addGlobalSecondaryIndex({
      indexName: 'articles-by-status-createdAt',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2: slug でルックアップ（記事詳細ページ用）
    articlesTable.addGlobalSecondaryIndex({
      indexName: 'articles-by-slug',
      partitionKey: { name: 'slug', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // =========================================================
    // 3. article-tags テーブル（タグ検索用マッピング）
    // =========================================================
    const articleTagsTable = new dynamodb.Table(this, 'ArticleTagsTable', {
      tableName: `${prefix}article-tags`,
      partitionKey: { name: 'tag', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt#articleId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // =========================================================
    // 4. users テーブル
    // =========================================================
    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: `${prefix}users`,
      partitionKey: { name: 'google_uid', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // =========================================================
    // 5. comments テーブル
    // =========================================================
    const commentsTable = new dynamodb.Table(this, 'CommentsTable', {
      tableName: `${prefix}comments`,
      partitionKey: { name: 'articleId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'commentId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GSI1: 全コメント一覧（管理画面用、createdAt ソート）
    commentsTable.addGlobalSecondaryIndex({
      indexName: 'comments-by-createdAt',
      partitionKey: { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2: ユーザー別コメント取得
    commentsTable.addGlobalSecondaryIndex({
      indexName: 'comments-by-userId',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // =========================================================
    // 6. payments テーブル
    // =========================================================
    const paymentsTable = new dynamodb.Table(this, 'PaymentsTable', {
      tableName: `${prefix}payments`,
      partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'created_at', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // =========================================================
    // 7. jobs テーブル（AI 非同期ジョブ管理）
    // =========================================================
    const jobsTable = new dynamodb.Table(this, 'JobsTable', {
      tableName: `${prefix}jobs`,
      partitionKey: { name: 'jobId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      timeToLiveAttribute: 'ttl',
    });

    // =========================================================
    // 8. S3 メディアバケット
    // =========================================================
    const mediaBucket = new s3.Bucket(this, 'MediaBucket', {
      bucketName: `homepage-media-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // =========================================================
    // 9. Secrets Manager（固定名シークレットを参照）
    //
    // setup で先行作成済み、または既存環境に存在する固定名を参照する。
    // CloudFormation で再作成すると AlreadyExists で失敗するため、
    // このスタックでは "作成" ではなく "import" を使う。
    // =========================================================
    const googleOAuthSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'GoogleOAuthSecret',
      'homepage/google-oauth-config',
    );

    const stripeSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'StripeSecret',
      'homepage/stripe-config',
    );

    // =========================================================
    // 10. Lambda (Next.js + Lambda Web Adapter)
    //
    // プロジェクトルートの Dockerfile からビルド。
    // CDK deploy 時に Docker ビルド + ECR プッシュを自動実行。
    // =========================================================
    const appLambda = new lambda.DockerImageFunction(this, 'AppLambda', {
      functionName: 'homepage-app',
      code: lambda.DockerImageCode.fromImageAsset(
        path.join(__dirname, '../..'),
        {
          platform: ecr_assets.Platform.LINUX_AMD64,
          // .dockerignore で不要ファイルを除外
        },
      ),
      memorySize: 1024,
      architecture: lambda.Architecture.X86_64,
      // AI 記事生成は非同期ジョブのため 60 秒で十分（blueprint §3.7）
      timeout: cdk.Duration.seconds(60),
      environment: {
        NODE_ENV: 'production',
        DYNAMODB_TABLE_PREFIX: prefix,
        S3_BUCKET_NAME: mediaBucket.bucketName,
        COGNITO_USER_POOL_ID: cognitoUserPoolId,
        COGNITO_CLIENT_ID: cognitoClientId,
        COGNITO_DOMAIN: cognitoDomain,
        // CLOUDFRONT_DISTRIBUTION_ID は distribution 作成後に addEnvironment で追加
        // Secrets Manager ARN (Lambda が実行時に GetSecretValue で取得)
        GOOGLE_OAUTH_SECRET_ARN: googleOAuthSecret.secretArn,
        STRIPE_SECRET_ARN: stripeSecret.secretArn,
      },
    });

    // DynamoDB 権限
    for (const table of [
      settingsTable, articlesTable, articleTagsTable,
      usersTable, commentsTable, paymentsTable, jobsTable,
    ]) {
      table.grantReadWriteData(appLambda);
    }

    // S3 権限
    mediaBucket.grantReadWrite(appLambda);

    // Secrets Manager 読み取り権限
    googleOAuthSecret.grantRead(appLambda);
    stripeSecret.grantRead(appLambda);

    // Lambda Function URL (AWS_IAM 認証 → CloudFront OAC が署名)
    const appFunctionUrl = appLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
    });

    // =========================================================
    // 11. CloudFront ディストリビューション
    //
    // Behavior 設計は blueprint §3 を参照。
    // =========================================================

    // デフォルト Behavior 用キャッシュポリシー（blueprint §3 テーブル参照）
    const appCachePolicy = new cloudfront.CachePolicy(this, 'AppCachePolicy', {
      cachePolicyName: 'homepage-app-cache',
      // Next.js が no-store を付与するが CloudFront Minimum TTL で上書き
      defaultTtl: cdk.Duration.hours(1),
      minTtl: cdk.Duration.hours(1),
      maxTtl: cdk.Duration.days(1),
      // ページネーション・タグ絞り込み用クエリ文字列のみ Cache Key に含める
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList('cursor', 'tag'),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // Lambda Function URL オリジン（OAC 付き）
    const lambdaOrigin = origins.FunctionUrlOrigin.withOriginAccessControl(appFunctionUrl);

    // S3 オリジン（OAC 付き）
    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(mediaBucket);

    const distribution = new cloudfront.Distribution(this, 'AppDistribution', {
      comment: 'homepage v2 app distribution',
      defaultBehavior: {
        origin: lambdaOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: appCachePolicy,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
      additionalBehaviors: {
        // メディアファイル: S3 OAC, 長期キャッシュ
        '/media/*': {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        },
        // 動的パス群: キャッシュ無効
        '/api/*': {
          origin: lambdaOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
        '/admin/*': {
          origin: lambdaOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
        '/auth/*': {
          origin: lambdaOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
        '/withdraw/*': {
          origin: lambdaOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
        '/payment/*': {
          origin: lambdaOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      // WAF は HomepageWafStack から渡された ARN（未設定の場合は WAF なし）
      webAclId: wafAclArn,
    });

    // CloudFront Invalidation 権限を Lambda に付与
    // Distribution ID を直接参照すると循環依存が発生しやすいため、
    // ここでは account 内の distribution 全体を対象に許可する。
    appLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudfront:CreateInvalidation'],
      resources: [
        `arn:aws:cloudfront::${this.account}:distribution/*`,
      ],
    }));

    // =========================================================
    // Outputs
    // =========================================================

    // DynamoDB テーブル名
    new cdk.CfnOutput(this, 'SettingsTableName', { value: settingsTable.tableName });
    new cdk.CfnOutput(this, 'ArticlesTableName', { value: articlesTable.tableName });
    new cdk.CfnOutput(this, 'ArticleTagsTableName', { value: articleTagsTable.tableName });
    new cdk.CfnOutput(this, 'UsersTableName', { value: usersTable.tableName });
    new cdk.CfnOutput(this, 'CommentsTableName', { value: commentsTable.tableName });
    new cdk.CfnOutput(this, 'PaymentsTableName', { value: paymentsTable.tableName });
    new cdk.CfnOutput(this, 'JobsTableName', { value: jobsTable.tableName });

    // S3
    new cdk.CfnOutput(this, 'MediaBucketName', { value: mediaBucket.bucketName });
    new cdk.CfnOutput(this, 'MediaBucketArn', { value: mediaBucket.bucketArn });

    // Lambda
    new cdk.CfnOutput(this, 'AppLambdaFunctionName', { value: appLambda.functionName });
    new cdk.CfnOutput(this, 'AppLambdaFunctionArn', { value: appLambda.functionArn });
    new cdk.CfnOutput(this, 'AppFunctionUrl', { value: appFunctionUrl.url });

    // CloudFront
    new cdk.CfnOutput(this, 'AppDistributionId', { value: distribution.distributionId });
    new cdk.CfnOutput(this, 'AppDistributionDomain', { value: distribution.distributionDomainName });

    // Secrets Manager
    new cdk.CfnOutput(this, 'GoogleOAuthSecretArn', { value: googleOAuthSecret.secretArn });
    new cdk.CfnOutput(this, 'StripeSecretArn', { value: stripeSecret.secretArn });
  }
}
