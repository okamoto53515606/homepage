/**
 * Stripe 設定管理 API（管理者用）
 *
 * GET  /api/admin/stripe-config — 現在の Stripe 設定を取得
 * POST /api/admin/stripe-config — Stripe 設定を Secrets Manager に保存
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin-auth';
import { isDevelopment, logger } from '@/lib/env';

const SECRET_ID = 'homepage/stripe-config';

export async function GET() {
  const adminUser = await getAdminUser();
  if (!adminUser.isAuthenticated) {
    return NextResponse.json({ error: '管理者権限がありません' }, { status: 403 });
  }

  try {
    if (isDevelopment()) {
      return NextResponse.json({
        secretKey: process.env.STRIPE_SECRET_KEY ? '***設定済み***' : '',
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ? '***設定済み***' : '',
        taxRates: process.env.STRIPE_TAX_RATES || '',
        termsOfServiceEnabled: process.env.STRIPE_TERMS_OF_SERVICE_ENABLED || '',
        source: 'env',
      });
    }

    const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });

    const result = await client.send(new GetSecretValueCommand({ SecretId: SECRET_ID }));
    if (!result.SecretString) {
      return NextResponse.json({ source: 'secrets-manager' });
    }

    const parsed = JSON.parse(result.SecretString);
    return NextResponse.json({
      secretKey: parsed.STRIPE_SECRET_KEY ? '***設定済み***' : '',
      webhookSecret: parsed.STRIPE_WEBHOOK_SECRET ? '***設定済み***' : '',
      taxRates: parsed.STRIPE_TAX_RATES || '',
      termsOfServiceEnabled: parsed.STRIPE_TERMS_OF_SERVICE_ENABLED || '',
      source: 'secrets-manager',
    });
  } catch (error) {
    logger.error('[Stripe] 設定取得エラー:', error);
    return NextResponse.json({ error: '設定の取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser.isAuthenticated) {
    return NextResponse.json({ error: '管理者権限がありません' }, { status: 403 });
  }

  if (isDevelopment()) {
    return NextResponse.json(
      { error: 'ローカル環境では .env ファイルを直接編集してください' },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const { secretKey, webhookSecret, taxRates, termsOfServiceEnabled } = body;

    if (!secretKey || typeof secretKey !== 'string') {
      return NextResponse.json({ error: 'secretKey は必須です' }, { status: 400 });
    }

    const { SecretsManagerClient, PutSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });

    await client.send(new PutSecretValueCommand({
      SecretId: SECRET_ID,
      SecretString: JSON.stringify({
        STRIPE_SECRET_KEY: secretKey,
        STRIPE_WEBHOOK_SECRET: webhookSecret || '',
        STRIPE_TAX_RATES: taxRates || '',
        STRIPE_TERMS_OF_SERVICE_ENABLED: termsOfServiceEnabled || '',
      }),
    }));

    logger.info('[Stripe] Secrets Manager に設定を保存しました');
    return NextResponse.json({ status: 'success', message: '設定を保存しました' });
  } catch (error) {
    logger.error('[Stripe] 設定保存エラー:', error);
    return NextResponse.json({ error: '設定の保存に失敗しました' }, { status: 500 });
  }
}
