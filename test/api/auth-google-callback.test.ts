/**
 * Google OAuth callback の PKCE / state 検証テスト
 *
 * why:
 *   PKCE state mismatch を検知できないと、攻撃者が用意した認可コードで
 *   被害者にログインさせる CSRF / コード奪取が成立する。
 *   Cookie が無い / state が一致しない場合に必ずエラーリダイレクトに飛ぶことを保証する。
 */
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/google-auth-session', () => ({
  createGoogleSession: vi.fn(),
  verifyGoogleIdToken: vi.fn(),
}));

vi.mock('@/lib/google-oauth', () => ({
  getGoogleOAuthConfig: vi.fn(async () => ({
    clientId: 'test-google-client',
    clientSecret: 'test-google-secret',
  })),
}));

vi.mock('@/lib/origin', () => ({
  getPublicOrigin: vi.fn(() => 'https://example.com'),
}));

vi.mock('@/lib/env', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

describe('GET /api/auth/google/callback — PKCE / state 検証', () => {
  it('code/state が無い → invalid_google_oauth_state にリダイレクト', async () => {
    const { GET } = await import('@/app/api/auth/google/callback/route');
    const req = new NextRequest('https://example.com/api/auth/google/callback');
    const res = await GET(req);
    expect(res.status).toBe(307); // Next redirect
    expect(res.headers.get('location')).toContain('invalid_google_oauth_state');
  });

  it('state が cookie と不一致 → invalid_google_oauth_state', async () => {
    const { GET } = await import('@/app/api/auth/google/callback/route');
    const req = new NextRequest('https://example.com/api/auth/google/callback?code=c&state=ATTACKER', {
      headers: {
        cookie: 'google_oauth_state=VICTIM; google_oauth_nonce=n; google_oauth_code_verifier=v',
      },
    });
    const res = await GET(req);
    expect(res.headers.get('location')).toContain('invalid_google_oauth_state');
  });

  it('Google から error=access_denied → google_oauth_denied', async () => {
    const { GET } = await import('@/app/api/auth/google/callback/route');
    const req = new NextRequest('https://example.com/api/auth/google/callback?error=access_denied');
    const res = await GET(req);
    expect(res.headers.get('location')).toContain('google_oauth_denied');
  });
});
