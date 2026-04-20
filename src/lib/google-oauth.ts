/**
 * Google OAuth 設定取得
 *
 * 【取得元】
 * - 本番: AWS Secrets Manager（homepage/google-oauth-config）
 * - ローカル: 環境変数（NEXT_PUBLIC_GOOGLE_CLIENT_ID）
 *
 * Secrets Manager のキー:
 *   { "GOOGLE_CLIENT_ID": "..." }
 */

import { isDevelopment, logger } from './env';

interface GoogleOAuthConfig {
  clientId: string;
}

export async function getGoogleOAuthConfig(): Promise<GoogleOAuthConfig> {
  // ローカル開発: 環境変数を直接使用
  if (isDevelopment()) {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error('NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set');
    return { clientId };
  }

  // 本番: Secrets Manager から取得
  const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });

  const result = await client.send(new GetSecretValueCommand({
    SecretId: 'homepage/google-oauth-config',
  }));

  if (!result.SecretString) {
    throw new Error('Google OAuth config secret is empty');
  }

  const parsed = JSON.parse(result.SecretString);
  logger.info('[GoogleOAuth] Secrets Manager から設定を取得しました');

  return {
    clientId: parsed.GOOGLE_CLIENT_ID,
  };
}
