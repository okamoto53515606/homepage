/**
 * GET /api/stripe/session 入力検証テスト
 *
 * why:
 *   2026/05/03 OWASP ZAP 初回スキャン (docs/20260503_dast-zap-initial-scan.md) で
 *   `?session_id=session_id` のような不正値で 500 を返していた。Stripe SDK の
 *   `StripeInvalidRequestError` を catch して 400 に変換する／フォーマット時点で
 *   弾く実装に変更したため、その回帰防止。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import Stripe from 'stripe';

const retrieveMock = vi.fn();

vi.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        retrieve: (...args: unknown[]) => retrieveMock(...args),
      },
    },
  },
}));

beforeEach(() => {
  retrieveMock.mockReset();
});

describe('GET /api/stripe/session', () => {
  it('session_id 欠落 → 400', async () => {
    const { GET } = await import('@/app/api/stripe/session/route');
    const req = new NextRequest('https://example.com/api/stripe/session');
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(retrieveMock).not.toHaveBeenCalled();
  });

  it('不正フォーマット (cs_ プレフィックス無し) → 400 で Stripe API 未呼出', async () => {
    const { GET } = await import('@/app/api/stripe/session/route');
    const req = new NextRequest(
      'https://example.com/api/stripe/session?session_id=session_id'
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(retrieveMock).not.toHaveBeenCalled();
  });

  it('Stripe StripeInvalidRequestError → 400 (500 にしない)', async () => {
    retrieveMock.mockRejectedValueOnce(
      new Stripe.errors.StripeInvalidRequestError({
        type: 'invalid_request_error',
        message: 'No such checkout.session',
      })
    );
    const { GET } = await import('@/app/api/stripe/session/route');
    const req = new NextRequest(
      'https://example.com/api/stripe/session?session_id=cs_test_AAAA1234'
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});
