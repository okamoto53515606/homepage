/**
 * Google Client ID 取得 API
 *
 * GET /api/auth/google-client-id
 *
 * クライアントサイドの OAuth フローで使用する Google Client ID を返します。
 * 本番では Secrets Manager から、ローカルでは環境変数から取得します。
 */

import { NextResponse } from 'next/server';
import { getGoogleOAuthConfig } from '@/lib/google-oauth';

export async function GET() {
  try {
    const config = await getGoogleOAuthConfig();
    return NextResponse.json({ clientId: config.clientId });
  } catch (error) {
    console.error('[GoogleOAuth] Client ID 取得エラー:', error);
    return NextResponse.json(
      { error: 'Google Client ID の取得に失敗しました' },
      { status: 500 }
    );
  }
}
