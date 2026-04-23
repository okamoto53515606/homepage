/**
 * Gemini API Key 設定管理 API（管理者用）
 *
 * GET  /api/admin/gemini-config — 現在の設定を取得
 * POST /api/admin/gemini-config — 設定を保存（Secrets Manager）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin-auth';
import { isDevelopment, logger } from '@/lib/env';

const SECRET_ID = 'homepage/gemini-config';

export async function GET() {
  const adminUser = await getAdminUser();
  if (!adminUser.isAuthenticated) {
    return NextResponse.json({ error: '管理者権限がありません' }, { status: 403 });
  }

  try {
    if (isDevelopment()) {
      return NextResponse.json({
        apiKey: process.env.GEMINI_API_KEY ? '***設定済み***' : '',
        source: 'env',
      });
    }

    const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });

    const result = await client.send(new GetSecretValueCommand({ SecretId: SECRET_ID }));
    if (!result.SecretString) {
      return NextResponse.json({ apiKey: '', source: 'secrets-manager' });
    }

    const parsed = JSON.parse(result.SecretString);
    return NextResponse.json({
      apiKey: parsed.GEMINI_API_KEY ? '***設定済み***' : '',
      source: 'secrets-manager',
    });
  } catch (error: unknown) {
    // AWS SDK v3 は ResourceNotFoundException を error.name に載せる（message は
    // "Secrets Manager can't find the specified secret." のみ）ため、name 優先で判定する。
    const name = (error as { name?: string } | null)?.name ?? '';
    const message = error instanceof Error ? error.message : '';
    if (name === 'ResourceNotFoundException' || message.includes('ResourceNotFoundException')) {
      return NextResponse.json({ apiKey: '', source: 'secrets-manager' });
    }

    logger.error('[Gemini] 設定取得エラー:', error);
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
    const { apiKey } = body;

    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json({ error: 'apiKey は必須です' }, { status: 400 });
    }

    const {
      SecretsManagerClient,
      PutSecretValueCommand,
      CreateSecretCommand,
      DescribeSecretCommand,
    } = await import('@aws-sdk/client-secrets-manager');
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });

    let exists = true;
    try {
      await client.send(new DescribeSecretCommand({ SecretId: SECRET_ID }));
    } catch (error: unknown) {
      // 初回保存時は Secret が存在しないため ResourceNotFoundException が想定内。
      // SDK v3 は error.name に種別を格納するため name で判定する。
      const name = (error as { name?: string } | null)?.name ?? '';
      const message = error instanceof Error ? error.message : '';
      if (name === 'ResourceNotFoundException' || message.includes('ResourceNotFoundException')) {
        exists = false;
      } else {
        throw error;
      }
    }

    if (!exists) {
      await client.send(new CreateSecretCommand({
        Name: SECRET_ID,
        Description: 'Gemini API Key 設定（管理画面から更新）',
        SecretString: JSON.stringify({ GEMINI_API_KEY: apiKey }),
      }));
    } else {
      await client.send(new PutSecretValueCommand({
        SecretId: SECRET_ID,
        SecretString: JSON.stringify({ GEMINI_API_KEY: apiKey }),
      }));
    }

    logger.info('[Gemini] Secrets Manager に設定を保存しました');
    return NextResponse.json({ status: 'success', message: '設定を保存しました' });
  } catch (error) {
    logger.error('[Gemini] 設定保存エラー:', error);
    return NextResponse.json({ error: '設定の保存に失敗しました' }, { status: 500 });
  }
}
