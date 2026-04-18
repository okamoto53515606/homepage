import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * DynamoDB テーブル定義スタック
 *
 * テーブル設計: docs/database-schema_v2.md
 *
 * 全テーブル共通:
 * - プレフィックス: homepage-
 * - 容量モード: PAY_PER_REQUEST (オンデマンド)
 * - PITR: 有効
 * - 削除保護: RETAIN
 */
export class DynamoDbStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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
    // Outputs
    // =========================================================
    new cdk.CfnOutput(this, 'SettingsTableName', { value: settingsTable.tableName });
    new cdk.CfnOutput(this, 'ArticlesTableName', { value: articlesTable.tableName });
    new cdk.CfnOutput(this, 'ArticleTagsTableName', { value: articleTagsTable.tableName });
    new cdk.CfnOutput(this, 'UsersTableName', { value: usersTable.tableName });
    new cdk.CfnOutput(this, 'CommentsTableName', { value: commentsTable.tableName });
    new cdk.CfnOutput(this, 'PaymentsTableName', { value: paymentsTable.tableName });

    // =========================================================
    // 7. S3 メディアバケット
    // =========================================================
    const mediaBucket = new s3.Bucket(this, 'MediaBucket', {
      bucketName: `homepage-media-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new cdk.CfnOutput(this, 'MediaBucketName', { value: mediaBucket.bucketName });
    new cdk.CfnOutput(this, 'MediaBucketArn', { value: mediaBucket.bucketArn });
  }
}
