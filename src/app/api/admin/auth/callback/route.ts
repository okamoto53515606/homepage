/**
 * Cognito 管理者認証コールバック API
 * 
 * Cognito Hosted UI からのリダイレクト先。
 * Authorization Code を受け取り、Cognito Token Endpoint でトークンに交換。
 * id_token を admin_session cookie にセットして /admin/ にリダイレクト。
 */

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/env';

const ADMIN_SESSION_COOKIE_NAME = 'admin_session';

function getTokenEndpoint(): string {
  const domain = process.env.COGNITO_DOMAIN;
  const region = process.env.COGNITO_USER_POOL_ID?.split('_')[0] || 'ap-northeast-1';
  if (!domain) throw new Error('COGNITO_DOMAIN is not set');
  return `https://${domain}.auth.${region}.amazoncognito.com/oauth2/token`;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const error = request.nextUrl.searchParams.get('error');

  // エラーハンドリング
  if (error) {
    logger.error(`[AdminAuth Callback] Cognito error: ${error}`);
    return NextResponse.redirect(new URL('/admin/login?error=cognito_error', request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/admin/login?error=no_code', request.url));
  }

  const clientId = process.env.COGNITO_CLIENT_ID;
  if (!clientId) {
    logger.error('[AdminAuth Callback] COGNITO_CLIENT_ID is not set');
    return NextResponse.redirect(new URL('/admin/login?error=config_error', request.url));
  }

  // コールバック URL を構築（Cognito に登録されている URL と一致させる）
  // CLOUDFRONT_DOMAIN を優先する理由: Lambda は host ヘッダーとして自身の Function URL
  // ドメインを受け取るため request.nextUrl.origin が CloudFront ドメインにならない。
  const cloudfrontDomain = process.env.CLOUDFRONT_DOMAIN;
  const callbackUrl = cloudfrontDomain
    ? `https://${cloudfrontDomain}/api/admin/auth/callback`
    : `${request.nextUrl.origin}/api/admin/auth/callback`;

  try {
    // Authorization Code → Token 交換
    const tokenResponse = await fetch(getTokenEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: callbackUrl,
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      logger.error(`[AdminAuth Callback] Token exchange failed: ${tokenResponse.status} ${errorBody}`);
      return NextResponse.redirect(new URL('/admin/login?error=token_exchange_failed', request.url));
    }

    const tokens = await tokenResponse.json();
    const idToken = tokens.id_token;

    if (!idToken) {
      logger.error('[AdminAuth Callback] No id_token in response');
      return NextResponse.redirect(new URL('/admin/login?error=no_id_token', request.url));
    }

    // id_token を admin_session cookie にセット
    // id_token 自体が Cognito 発行の JWT なので、getAdminUser() で JWKS 検証可能
    const cookieStore = await cookies();
    cookieStore.set(ADMIN_SESSION_COOKIE_NAME, idToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 12, // 12 時間
    });

    logger.info('[AdminAuth Callback] Admin session created');
    return NextResponse.redirect(new URL('/admin/', request.url));

  } catch (error) {
    logger.error('[AdminAuth Callback] Error:', error);
    return NextResponse.redirect(new URL('/admin/login?error=server_error', request.url));
  }
}
