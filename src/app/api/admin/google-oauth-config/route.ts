/**
 * Google OAuth 設定管理 API（管理者用）
 *
 * GET  /api/admin/google-oauth-config — 現在の設定を取得
 * POST /api/admin/google-oauth-config — 設定を保存（Secrets Manager）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin-auth';
import { isDevelopment, logger } from '@/lib/env';

const SECRET_ID = 'homepage/google-oauth-config';

export async function GET() {
  const adminUser = await getAdminUser();
  if (!adminUser.isAuthenticated) {
    return NextResponse.json({ error: '管理者権限がありません' }, { status: 403 });
  }

  try {
    if (isDevelopment()) {
      return NextResponse.json({
        clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
        source: 'env',
      });
    }

    const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });

    const result = await client.send(new GetSecretValueCommand({ SecretId: SECRET_ID }));
    if (!result.SecretString) {
      return NextResponse.json({ clientId: '', source: 'secrets-manager' });
    }

    const parsed = JSON.parse(result.SecretString);
    return NextResponse.json({
      clientId: parsed.GOOGLE_CLIENT_ID || '',
      source: 'secrets-manager',
    });
  } catch (error) {
    logger.error('[GoogleOAuth] 設定取得エラー:', error);
    return NextResponse.json({ error: '設定の取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser.isAuthenticated) {
    return NextResponse.json({ error: '管理者権限がありません' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { clientId } = body;

    if (!clientId || typeof clientId !== 'string') {
      return NextResponse.json({ error: 'clientId は必須です' }, { status: 400 });
    }

    const { SecretsManagerClient, PutSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });

    await client.send(new PutSecretValueCommand({
      SecretId: SECRET_ID,
      SecretString: JSON.stringify({ GOOGLE_CLIENT_ID: clientId }),
    }));

    logger.info('[GoogleOAuth] Secrets Manager に設定を保存しました');
    return NextResponse.json({ status: 'success', message: '設定を保存しました' });
  } catch (error) {
    logger.error('[GoogleOAuth] 設定保存エラー:', error);
    return NextResponse.json({ error: '設定の保存に失敗しました' }, { status: 500 });
  }
}
