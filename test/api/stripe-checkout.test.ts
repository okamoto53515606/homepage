/**
 * Stripe Checkout 作成 API のテスト
 *
 * why:
 *   /api/stripe/checkout は session JWT から userId を取得する設計に変更した
 *   （以前は body.userId を信用していた）。これは「他人の uid を body に
 *   入れて他人の access_expiry を購入で上書きする」攻撃を塞ぐためのゲート。
 *   この保証はサーバー側コード 1 行で崩れる（getUser の呼び出しを消したり
 *   body.userId を採用してしまう退行）。SAST では検知できないので、
 *   攻撃観点で:
 *     1. セッションが無ければ 401
 *     2. body.userId は無視され、Stripe API には session の uid が渡る
 *   を Vitest で固定しておく。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const sessionsCreate = vi.fn(async () => ({ id: 'cs_test_123', url: 'https://stripe/test' }));

vi.mock('@/lib/auth', () => ({
  getUser: vi.fn(async () => ({ isLoggedIn: false, role: 'guest' })),
}));

vi.mock('@/lib/stripe', () => ({
  getStripeAsync: vi.fn(async () => ({
    checkout: { sessions: { create: sessionsCreate } },
  })),
  getStripeConfig: vi.fn(async () => ({ taxRates: undefined })),
  getDynamicPaymentConfig: vi.fn(async () => ({ amount: 500, accessDays: 30 })),
  BASE_PAYMENT_CONFIG: {
    currency: 'jpy',
    productName: '有料記事アクセス',
    productDescription: 'desc',
  },
}));

vi.mock('@/lib/env', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  getClientIp: vi.fn(async () => '203.0.113.1'),
}));

vi.mock('@/lib/origin', () => ({
  getPublicOrigin: vi.fn(() => 'https://example.com'),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/stripe/checkout — 認証ゲート', () => {
  it('未ログインで POST → 401', async () => {
    const { POST } = await import('@/app/api/stripe/checkout/route');
    const req = new NextRequest('https://example.com/api/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({ userId: 'attacker-supplied', returnUrl: '/articles/x' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});

describe('POST /api/stripe/checkout — userId 改ざん耐性', () => {
  beforeEach(async () => {
    const auth = await import('@/lib/auth');
    vi.mocked(auth.getUser).mockResolvedValue({
      isLoggedIn: true,
      uid: 'real-user-uid',
      email: 'real@example.com',
      role: 'free_member',
    });
  });

  it('body.userId が攻撃者の値でも Stripe には session JWT の uid が渡る', async () => {
    const { POST } = await import('@/app/api/stripe/checkout/route');
    const req = new NextRequest('https://example.com/api/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'victim-uid',
        userEmail: 'victim@example.com',
        returnUrl: '/articles/x',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(sessionsCreate).toHaveBeenCalledTimes(1);
    const arg = sessionsCreate.mock.calls[0][0] as {
      client_reference_id: string;
      customer_email?: string;
      metadata: { userId: string };
    };
    expect(arg.client_reference_id).toBe('real-user-uid');
    expect(arg.metadata.userId).toBe('real-user-uid');
    expect(arg.customer_email).toBe('real@example.com');
  });

  it('returnUrl が外部 URL の場合は無視される（open redirect 防止）', async () => {
    const { POST } = await import('@/app/api/stripe/checkout/route');
    const req = new NextRequest('https://example.com/api/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({ returnUrl: 'https://evil.example.org/phish' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // success_url / cancel_url に外部 URL が含まれていないこと
    const arg = sessionsCreate.mock.calls[0][0] as {
      success_url: string;
      cancel_url: string;
    };
    expect(arg.cancel_url.startsWith('https://example.com')).toBe(true);
    expect(arg.cancel_url).not.toContain('evil.example.org');
    expect(arg.success_url).not.toContain('evil.example.org');
  });

  it('returnUrl が // 始まり (protocol-relative) も無視される', async () => {
    const { POST } = await import('@/app/api/stripe/checkout/route');
    const req = new NextRequest('https://example.com/api/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({ returnUrl: '//evil.example.org/phish' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const arg = sessionsCreate.mock.calls[0][0] as { cancel_url: string };
    expect(arg.cancel_url).not.toContain('evil.example.org');
  });
});
