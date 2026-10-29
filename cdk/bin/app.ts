#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { InfraStack } from '../lib/infra-stack';
import { WafStack } from '../lib/waf-stack';
import { CognitoStack } from '../lib/cognito-stack';
import { MonitoringStack, EdgeMonitoringStack } from '../lib/monitoring-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'ap-northeast-1',
};

/**
 * setup1a: Cognito User Pool（管理者認証）
 */
new CognitoStack(app, 'HomepageCognitoStack', { env });

/**
 * setup1b: WAF（us-east-1 固定 — CloudFront 用 WAF の要件）
 *
 * CDK コンテキスト:
 *   --context wafMode=ip      IPアドレス制限
 *   --context wafMode=captcha CAPTCHA（デフォルト）
 *   --context allowedIPs=1.2.3.4/32,5.6.7.8/32
 *
 * デプロイ順: HomepageWafStack を先に実行し、出力の WebAclArn を
 * HomepageDynamoDbStack の --context wafAclArn に渡す。
 * (cdk-deploy-1b API が 2 ステップで自動実行)
 */
new WafStack(app, 'HomepageWafStack', {
  env: { account: env.account, region: 'us-east-1' },
});

/**
 * setup1b: メインインフラ（DynamoDB, S3, Lambda, CloudFront, Secrets Manager）
 *
 * CDK コンテキスト:
 *   --context wafAclArn=arn:aws:wafv2:...
 *   --context cognitoUserPoolId=...
 *   --context cognitoClientId=...
 *   --context cognitoDomain=...
 *
 * スタック ID は HomepageDynamoDbStack のまま維持
 * （移行テスト用に先行デプロイ済みの CloudFormation スタックを継続管理）
 */
new InfraStack(app, 'HomepageDynamoDbStack', { env });

/**
 * 監視（アラート）
 *
 * why: 2026/10/24〜10/30 の 502 障害を「利用者の報告」でしか検知できなかった反省から、
 *      異常の早期検知をインフラとして持つ。
 *      監視の追加・変更でアプリスタック（Lambda の Docker イメージ）を再デプロイ
 *      しなくて済むよう、独立したスタックに分離している。
 *
 * リージョンが 2 つに分かれる理由:
 *   - Lambda のメトリクスは ap-northeast-1 にしか存在しない
 *   - CloudFront のメトリクスは us-east-1 にしか存在しない
 *
 * CDK コンテキスト:
 *   --context alarmEmail=<通知先メール>
 *   --context distributionId=<CloudFront の ID>（未指定なら cdk-outputs.json から解決）
 */
new MonitoringStack(app, 'HomepageMonitoringStack', { env });

new EdgeMonitoringStack(app, 'HomepageMonitoringEdgeStack', {
  env: { account: env.account, region: 'us-east-1' },
});
