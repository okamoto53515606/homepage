#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { InfraStack } from '../lib/infra-stack';
import { WafStack } from '../lib/waf-stack';
import { CognitoStack } from '../lib/cognito-stack';

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
