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
    const jwtSecret = (this.node.tryGetContext('jwtSecret') as string) ?? '';
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

    const geminiSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'GeminiSecret',
      'homepage/gemini-config',
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
        TABLE_PREFIX: prefix,
        S3_BUCKET_NAME: mediaBucket.bucketName,
        JWT_SECRET: jwtSecret,
        COGNITO_USER_POOL_ID: cognitoUserPoolId,
        COGNITO_CLIENT_ID: cognitoClientId,
        COGNITO_DOMAIN: cognitoDomain,
        // CLOUDFRONT_DOMAIN / CLOUDFRONT_DISTRIBUTION_ID は distribution 作成後に addEnvironment で追加
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
    geminiSecret.grantRead(appLambda);

    // Secrets Manager 書き込み/作成権限
    //
    // 理由:
    //   管理画面 (/api/admin/*-config) から各シークレットを初回作成・更新できる仕様にしているため、
    //   CreateSecret / PutSecretValue / DescribeSecret を Lambda ロールに付与する必要がある。
    //   CreateSecret は resource-level で制限できないため account 全体に付与し、
    //   PutSecretValue / DescribeSecret は homepage/* にスコープ限定して最小権限を保つ。
    appLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:CreateSecret'],
      resources: ['*'],
    }));
    appLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'secretsmanager:PutSecretValue',
        'secretsmanager:UpdateSecret',
        'secretsmanager:DescribeSecret',
        'secretsmanager:GetSecretValue',
      ],
      resources: [
        `arn:aws:secretsmanager:${this.region}:${this.account}:secret:homepage/*`,
      ],
    }));

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
      // 【なぜ RSC 系ヘッダを Cache Key に含めるか】
      // Next.js App Router では、<Link> のプリフェッチ/ソフトナビゲーションで
      // 同じ URL に対し RSC ペイロード（JSON 様の特殊形式）が返る。これを
      // ヘッダで区別せずキャッシュすると、HTML ナビと RSC プリフェッチが
      // 同じキーになり「同じ URL でページが出たり JSON が出たりする」現象が
      // 発生する。`RSC` / `Next-Router-Prefetch` / `Next-Router-State-Tree` /
      // `Next-Url` / `Accept` を Cache Key に入れて別物として扱う。
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
        'rsc',
        'next-router-prefetch',
        'next-router-state-tree',
        'next-url',
        'accept',
      ),
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

    // CLOUDFRONT_DOMAIN / CLOUDFRONT_DISTRIBUTION_ID の Lambda 環境変数注入は
    // CDK スタック内では行わない。
    // 理由:
    //   Lambda → Distribution（env 参照） / Distribution → LambdaFunctionUrl（origin）
    //   / LambdaPermission → Distribution の関係で CloudFormation 循環依存が発生するため。
    //   代わりに setup1b の API (setup/src/app/api/cdk-deploy-1b/route.ts) で
    //   CDK デプロイ完了後に Lambda UpdateFunctionConfiguration で後付け注入する。

    // CloudFront OAC -> Lambda Function URL の権限を明示付与
    // 2025/10 以降は InvokeFunctionUrl と InvokeFunction の両方が必要。
    appLambda.addPermission('AllowCloudFrontInvokeFunctionUrl', {
      principal: new iam.ServicePrincipal('cloudfront.amazonaws.com'),
      action: 'lambda:InvokeFunctionUrl',
      sourceArn: distribution.distributionArn,
      functionUrlAuthType: lambda.FunctionUrlAuthType.AWS_IAM,
    });

    appLambda.addPermission('AllowCloudFrontInvokeFunction', {
      principal: new iam.ServicePrincipal('cloudfront.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: distribution.distributionArn,
      invokedViaFunctionUrl: true,
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
    // 12. Stripe Webhook Proxy Lambda（blueprint §3.6）
    //
    // why:
    //   Stripe からの Webhook POST は CloudFront OAC の
    //   x-amz-content-sha256 ヘッダを付けられないため、OAC 経由では
    //   403 になる。CloudFront を経由しない専用の Lambda Function URL
    //   (AuthType: NONE) を Stripe 登録先とし、そこから SigV4 署名済み
    //   POST で CloudFront (OAC) → /api/stripe/webhook に転送する。
    //   Stripe 署名検証 (stripe-signature) は Next.js 側で実施するため、
    //   Proxy 側はボディとヘッダを素通しするだけの極薄実装。
    //
    // 実装メモ:
    //   - Node.js 20 + インラインコード。AWS Lambda ランタイムには
    //     @aws-sdk/* / @smithy/* がプリインストールされているため、
    //     追加の bundle 不要。
    //   - IAM 認証先 (Lambda Function URL via CloudFront) へ投げるので
    //     SigV4 署名が必要。@aws-sdk/signature-v4 + defaultProvider で
    //     Lambda の実行ロール認証情報を使って署名する。
    //   - この Lambda 自身の実行ロールに lambda:InvokeFunctionUrl は
    //     不要（OAC 経由のため CloudFront が principal）。実際に必要
    //     なのは署名付き HTTPS POST を CloudFront に投げる権限のみで
    //     IAM 権限は特別には要らない。
    // =========================================================
    const stripeWebhookProxyCode = `
// Proxy Lambda: Stripe Webhook の SigV4 署名付き転送（blueprint §3.6）
// why: Stripe は x-amz-content-sha256 を付与できないため OAC 直POST は不可。
//      本 Lambda でボディハッシュを計算し SigV4 で署名した上で CloudFront へ転送する。
//      Stripe 署名検証 (stripe-signature) は Next.js 側が行うため、本 Lambda は
//      ヘッダ/ボディを素通しするだけで、Webhook Secret を保持しない。
//
// SigV4 は @aws-sdk を使わず node:crypto だけで手書き実装する。
// 理由: Lambda Node.js 20 ランタイムで inline code から @aws-sdk/* の
//       内部依存 (@smithy, @aws-crypto) が解決できる保証がないため、
//       依存ゼロで動作確実性を担保する。
const crypto = require('crypto');
const https = require('https');

const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN;
const REGION = process.env.AWS_REGION || 'us-east-1';
const SERVICE = 'lambda';

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}
function sha256hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// AWS SigV4 署名（署名対象: CloudFront 越しの Lambda Function URL）
function signRequest({ method, host, path, headers, body, creds }) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\\.\\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256hex(body);

  const signedHeadersList = ['host', 'x-amz-date', 'x-amz-content-sha256'];
  const allHeaders = {
    ...headers,
    host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  };
  if (creds.sessionToken) {
    allHeaders['x-amz-security-token'] = creds.sessionToken;
    signedHeadersList.push('x-amz-security-token');
  }
  signedHeadersList.sort();

  const canonicalHeaders =
    signedHeadersList.map((k) => k + ':' + String(allHeaders[k]).trim() + '\\n').join('');
  const signedHeaders = signedHeadersList.join(';');
  const canonicalRequest = [
    method,
    path,
    '', // canonical query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\\n');

  const credentialScope = [dateStamp, REGION, SERVICE, 'aws4_request'].join('/');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join('\\n');

  const kDate = hmac('AWS4' + creds.secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const authorization =
    'AWS4-HMAC-SHA256 Credential=' + creds.accessKeyId + '/' + credentialScope +
    ', SignedHeaders=' + signedHeaders +
    ', Signature=' + signature;

  return {
    ...allHeaders,
    Authorization: authorization,
  };
}

exports.handler = async (event) => {
  if (!CLOUDFRONT_DOMAIN) {
    return { statusCode: 500, body: 'CLOUDFRONT_DOMAIN not configured' };
  }

  // 実行ロールの認証情報は Lambda 実行環境変数から取得
  const creds = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  };

  // Function URL (payload v2) のボディを Buffer 化
  const raw = event.body || '';
  const bodyBuf = event.isBase64Encoded
    ? Buffer.from(raw, 'base64')
    : Buffer.from(raw, 'utf8');

  // Stripe 署名検証に必要なヘッダのみ明示転送（大文字小文字揺れ対応）
  const h = event.headers || {};
  const pick = (name) => h[name] || h[name.toLowerCase()] || '';
  const forwardHeaders = {
    'content-type': pick('content-type') || 'application/json',
    'stripe-signature': pick('stripe-signature'),
  };

  const signedHeaders = signRequest({
    method: 'POST',
    host: CLOUDFRONT_DOMAIN,
    path: '/api/stripe/webhook',
    headers: forwardHeaders,
    body: bodyBuf,
    creds,
  });

  return await new Promise((resolve) => {
    const r = https.request(
      {
        method: 'POST',
        hostname: CLOUDFRONT_DOMAIN,
        path: '/api/stripe/webhook',
        headers: signedHeaders,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({
            statusCode: res.statusCode || 502,
            headers: { 'content-type': res.headers['content-type'] || 'text/plain' },
            body,
          });
        });
      },
    );
    r.on('error', (err) => {
      console.error('proxy error', err);
      resolve({ statusCode: 502, body: 'proxy error: ' + err.message });
    });
    r.write(bodyBuf);
    r.end();
  });
};
`;

    const stripeWebhookProxyLambda = new lambda.Function(this, 'StripeWebhookProxyLambda', {
      functionName: 'homepage-stripe-webhook-proxy',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromInline(stripeWebhookProxyCode),
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      environment: {
        // why: アプリ本体 Lambda と同じキー名で統一。独自ドメイン切替時は
        //      setup 側の upsertLambdaEnv で CLOUDFRONT_DOMAIN を両 Lambda に書き込めば済む。
        CLOUDFRONT_DOMAIN: distribution.distributionDomainName,
      },
    });

    // AuthType: NONE で公開。Stripe からの POST を受け付ける。
    // why: Stripe 署名検証は Next.js 側で行うため、ここでは IAM 認証不要。
    //      不正リクエストは /api/stripe/webhook 側で stripe-signature 検証により弾かれる。
    const stripeWebhookProxyUrl = stripeWebhookProxyLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

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
    new cdk.CfnOutput(this, 'AppLambdaFunctionArn', { value: appLambda.functionArn });
    new cdk.CfnOutput(this, 'AppFunctionUrl', { value: appFunctionUrl.url });

    // CloudFront
    new cdk.CfnOutput(this, 'AppDistributionId', { value: distribution.distributionId });
    new cdk.CfnOutput(this, 'AppDistributionDomain', { value: distribution.distributionDomainName });

    // Secrets Manager
    new cdk.CfnOutput(this, 'GoogleOAuthSecretArn', { value: googleOAuthSecret.secretArn });
    new cdk.CfnOutput(this, 'StripeSecretArn', { value: stripeSecret.secretArn });

    // Stripe Webhook Proxy（Stripe Dashboard の Webhook URL に登録する URL）
    new cdk.CfnOutput(this, 'StripeWebhookProxyUrl', { value: stripeWebhookProxyUrl.url });
  }
}
