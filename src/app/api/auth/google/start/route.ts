import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getGoogleOAuthConfig } from '@/lib/google-oauth';

const OAUTH_COOKIE_MAX_AGE = 10 * 60;

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function buildPkceChallenge(codeVerifier: string): string {
  return toBase64Url(createHash('sha256').update(codeVerifier).digest());
}

function normalizeReturnTo(value: string | null): string {
  if (!value) return '/';
  if (!value.startsWith('/')) return '/';
  if (value.startsWith('//')) return '/';
  return value;
}

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: OAUTH_COOKIE_MAX_AGE,
    path: '/',
  };
}

export async function GET(request: NextRequest) {
  const { clientId } = await getGoogleOAuthConfig();
  const state = toBase64Url(randomBytes(32));
  const nonce = toBase64Url(randomBytes(32));
  const codeVerifier = toBase64Url(randomBytes(64));
  const codeChallenge = buildPkceChallenge(codeVerifier);
  const returnTo = normalizeReturnTo(request.nextUrl.searchParams.get('returnTo'));
  const redirectUri = new URL('/api/auth/google/callback', request.nextUrl.origin).toString();

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('nonce', nonce);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  const response = NextResponse.redirect(authUrl);
  const cookieOptions = getCookieOptions();

  response.cookies.set('google_oauth_state', state, cookieOptions);
  response.cookies.set('google_oauth_nonce', nonce, cookieOptions);
  response.cookies.set('google_oauth_code_verifier', codeVerifier, cookieOptions);
  response.cookies.set('google_oauth_return_to', returnTo, cookieOptions);

  return response;
}
