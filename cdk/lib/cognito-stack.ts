import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

/**
 * Cognito スタック（管理画面認証用）
 *
 * - User Pool: MFA 必須（TOTP）
 * - Hosted UI: カスタムログイン画面は作らない
 * - 管理者のみが使用（一般ユーザーは Google OAuth）
 */
export class CognitoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =========================================================
    // 1. Cognito User Pool
    // =========================================================
    const userPool = new cognito.UserPool(this, 'AdminUserPool', {
      userPoolName: 'homepage-admin-pool',
      selfSignUpEnabled: false, // 管理者のみ（Admin API で作成）
      signInAliases: { email: true },
      autoVerify: { email: true },
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: {
        sms: false,
        otp: true, // TOTP のみ
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // =========================================================
    // 2. Cognito App Client（Hosted UI 用）
    // =========================================================
    const userPoolClient = userPool.addClient('AdminAppClient', {
      userPoolClientName: 'homepage-admin-client',
      generateSecret: false,
      authFlows: {
        userSrp: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
        ],
        callbackUrls: [
          'http://localhost:3000/admin',       // ローカル開発
          'http://localhost:9002/admin',        // 本番アプリローカル
        ],
        logoutUrls: [
          'http://localhost:3000/',
          'http://localhost:9002/',
        ],
      },
    });

    // =========================================================
    // 3. Cognito Hosted UI ドメイン
    // =========================================================
    const domain = userPool.addDomain('AdminHostedUIDomain', {
      cognitoDomain: {
        domainPrefix: `homepage-admin-${this.account}`,
      },
    });

    // =========================================================
    // Outputs
    // =========================================================
    new cdk.CfnOutput(this, 'CognitoUserPoolId', {
      value: userPool.userPoolId,
    });

    new cdk.CfnOutput(this, 'CognitoClientId', {
      value: userPoolClient.userPoolClientId,
    });

    new cdk.CfnOutput(this, 'CognitoHostedUIDomain', {
      value: domain.domainName,
    });

    new cdk.CfnOutput(this, 'CognitoHostedUIUrl', {
      value: `https://${domain.domainName}.auth.${this.region}.amazoncognito.com`,
    });
  }
}
