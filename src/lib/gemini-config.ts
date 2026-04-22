/**
 * Gemini API Key 設定取得
 *
 * 【取得元】
 * - 本番: AWS Secrets Manager（homepage/gemini-config）
 * - ローカル: 環境変数（GEMINI_API_KEY）
 */

import { isDevelopment, logger } from './env';

const SECRET_ID = 'homepage/gemini-config';

export interface GeminiConfig {
  apiKey: string;
}

export async function getGeminiConfig(): Promise<GeminiConfig> {
  if (isDevelopment()) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    return { apiKey };
  }

  const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });

  const result = await client.send(new GetSecretValueCommand({ SecretId: SECRET_ID }));
  if (!result.SecretString) {
    throw new Error('Gemini config secret is empty');
  }

  const parsed = JSON.parse(result.SecretString);
  if (!parsed.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set in secret');
  }

  logger.info('[Gemini] Secrets Manager から設定を取得しました');
  return { apiKey: parsed.GEMINI_API_KEY };
}
