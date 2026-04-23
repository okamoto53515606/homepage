import { NextRequest, NextResponse } from 'next/server';
import { createGoogleSession, verifyGoogleIdToken } from '@/lib/google-auth-session';
import { logger } from '@/lib/env';
import { getGoogleOAuthConfig } from '@/lib/google-oauth';
import { getPublicOrigin } from '@/lib/origin';

function buildRedirectTarget(request: NextRequest, path: string, message?: string): URL {
  // getPublicOrigin: Lambda の host ヘッダーは Function URL ドメインのため、
  // ブラウザへの内部リダイレクトに CloudFront ドメインを確実に使う。
  const url = new URL(path, getPublicOrigin(request));
  if (message) {
    url.searchParams.set('error', message);
  }
  return url;
}

function clearOAuthCookies(response: NextResponse) {
  const expiredCookie = { maxAge: 0, path: '/' };
  response.cookies.set('google_oauth_state', '', expiredCookie);
  response.cookies.set('google_oauth_nonce', '', expiredCookie);
  response.cookies.set('google_oauth_code_verifier', '', expiredCookie);
  response.cookies.set('google_oauth_return_to', '', expiredCookie);
}

export async function GET(request: NextRequest) {
  const error = request.nextUrl.searchParams.get('error');
  if (error) {
    const response = NextResponse.redirect(buildRedirectTarget(request, '/auth/callback', 'google_oauth_denied'));
    clearOAuthCookies(response);
    return response;
  }

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const expectedState = request.cookies.get('google_oauth_state')?.value;
  const expectedNonce = request.cookies.get('google_oauth_nonce')?.value;
  const codeVerifier = request.cookies.get('google_oauth_code_verifier')?.value;
  const returnTo = request.cookies.get('google_oauth_return_to')?.value || '/';

  if (!code || !state || !expectedState || !expectedNonce || !codeVerifier || state !== expectedState) {
    const response = NextResponse.redirect(buildRedirectTarget(request, '/auth/callback', 'invalid_google_oauth_state'));
    clearOAuthCookies(response);
    return response;
  }

  try {
    const { clientId, clientSecret } = await getGoogleOAuthConfig();
    const redirectUri = new URL('/api/auth/google/callback', getPublicOrigin(request)).toString();

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
      cache: 'no-store',
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Google token exchange failed: ${errorText}`);
    }

    const tokenData = (await tokenResponse.json()) as { id_token?: string };
    if (!tokenData.id_token) {
      throw new Error('Google token response に id_token がありません');
    }

    const googleUser = await verifyGoogleIdToken(tokenData.id_token, expectedNonce);
    await createGoogleSession(googleUser);

    const response = NextResponse.redirect(buildRedirectTarget(request, returnTo));
    clearOAuthCookies(response);
    return response;
  } catch (routeError) {
    logger.error('[GoogleOAuth] コールバック処理エラー:', routeError);
    const response = NextResponse.redirect(buildRedirectTarget(request, '/auth/callback', 'google_oauth_failed'));
    clearOAuthCookies(response);
    return response;
  }
}
