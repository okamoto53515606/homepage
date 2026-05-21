/**
 * Stripe Webhook 署名検証テスト
 *
 * why:
 *   Stripe Webhook は署名 (HMAC-SHA256) で正当性を担保する経路。
 *   - 署名ヘッダ欠落 → 400
 *   - 署名検証失敗 → 400
 *   この 2 ゲートが消えると、攻撃者が任意のイベントを偽装して
 *   有料アクセス権を不正付与できる。回帰防止が必須。
 *
 *   また、Stripe は 2xx 以外のレスポンスでリトライするため、
 *   重複 checkout.session.completed イベントに対して
 *   access_expiry が二重延長されないことも検証する。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';

vi.mock('@/lib/stripe', () => ({
  getStripeAsync: vi.fn(async () => ({
    webhooks: {
      constructEvent: vi.fn(() => {
        // why: 既定では「不正署名」を表現。各テストで上書きする。
        throw new Error('No signatures found matching the expected signature');
      }),
    },
  })),
  getStripeConfig: vi.fn(async () => ({ webhookSecret: 'whsec_test' })),
}));

vi.mock('@/lib/user-access-admin', () => ({
  grantAccessToUserAdmin: vi.fn(async () => undefined),
  createPaymentRecord: vi.fn(async () => 'payment_id_stub'),
}));

vi.mock('@/lib/env', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/stripe/webhook', () => {
  it('stripe-signature ヘッダ無し → 400', async () => {
    const { POST } = await import('@/app/api/stripe/webhook/route');
    const req = new NextRequest('https://example.com/api/stripe/webhook', {
      method: 'POST',
      body: '{"type":"checkout.session.completed"}',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('不正な署名 → 400 (constructEvent throws)', async () => {
    const { POST } = await import('@/app/api/stripe/webhook/route');
    const req = new NextRequest('https://example.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=invalid' },
      body: '{"type":"checkout.session.completed"}',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('署名 OK → 200 (handleCheckoutCompleted は別経路でモック済)', async () => {
    const stripe = await import('@/lib/stripe');
    vi.mocked(stripe.getStripeAsync).mockResolvedValue({
      // @ts-expect-error 部分モック
      webhooks: {
        constructEvent: vi.fn(() => ({
          type: 'unknown.event',
          data: { object: {} },
        })),
      },
    });
    const { POST } = await import('@/app/api/stripe/webhook/route');
    const req = new NextRequest('https://example.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=valid' },
      body: '{"type":"unknown.event"}',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('重複 webhook (ConditionalCheckFailedException) → 200 スキップ・アクセス二重付与なし', async () => {
    // why: Stripe は 2xx 以外でリトライするため、同一 session.completed が
    //      2 回以上届くケースがある。createPaymentRecord の ConditionExpression が
    //      ConditionalCheckFailedException を投げた時、webhook が 200 を返して
    //      grantAccessToUserAdmin を呼ばないことを確認する。
    const stripe = await import('@/lib/stripe');
    vi.mocked(stripe.getStripeAsync).mockResolvedValue({
      // @ts-expect-error 部分モック
      webhooks: {
        constructEvent: vi.fn(() => ({
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test_duplicate',
              payment_status: 'paid',
              client_reference_id: 'user_abc',
              metadata: { accessDays: '30', clientIp: '1.2.3.4' },
              amount_total: 1000,
              currency: 'jpy',
              payment_intent: 'pi_test_123',
              created: 1700000000,
            },
          },
        })),
      },
    });

    const userAccessAdmin = await import('@/lib/user-access-admin');
    vi.mocked(userAccessAdmin.createPaymentRecord).mockRejectedValueOnce(
      new ConditionalCheckFailedException({ message: 'The conditional request failed', $metadata: {} })
    );

    const { POST } = await import('@/app/api/stripe/webhook/route');
    const req = new NextRequest('https://example.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=valid' },
      body: '{}',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(userAccessAdmin.grantAccessToUserAdmin).not.toHaveBeenCalled();
  });
});
