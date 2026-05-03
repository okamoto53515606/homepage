import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';

/**
 * Stripe Checkout セッション情報取得 API
 *
 * 決済完了後に領収書URLなどを取得するために使用
 *
 * リクエスト例:
 * GET /api/stripe/session?session_id=cs_test_xxx
 *
 * why（入力検証ポリシー）:
 *   2026/05/03 OWASP ZAP 初回スキャン (docs/20260503_dast-zap-initial-scan.md) で
 *   `?session_id=session_id` のような不正値で 500 を返していた。これは
 *   Stripe SDK の InvalidRequestError をそのまま 500 にしていたのが原因。
 *   - 不正フォーマットは取得処理に進む前に 400 で弾く
 *   - Stripe API が `invalid_request_error` を返したら 400 に変換する
 *   - 想定外例外のみ 500 に残す（情報漏洩を避けるためメッセージは固定文言）
 */

// Stripe Checkout Session ID は `cs_live_xxx` / `cs_test_xxx` の形式。
// 英数字とアンダースコアのみ許容、長さも上限を設けて enumeration を抑える。
const SESSION_ID_PATTERN = /^cs_(?:live|test)_[A-Za-z0-9]{1,200}$/;

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id');

  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    return NextResponse.json(
      { error: 'invalid session_id' },
      { status: 400 }
    );
  }

  try {
    // Checkoutセッションを取得（payment_intentを展開）
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });

    // PaymentIntentから領収書URLを取得
    let receiptUrl: string | null = null;

    if (session.payment_intent && typeof session.payment_intent !== 'string') {
      const paymentIntent = session.payment_intent;

      // latest_chargeから領収書URLを取得
      if (paymentIntent.latest_charge) {
        const charge = await stripe.charges.retrieve(
          typeof paymentIntent.latest_charge === 'string'
            ? paymentIntent.latest_charge
            : paymentIntent.latest_charge.id
        );
        receiptUrl = charge.receipt_url;
      }
    }

    return NextResponse.json({
      sessionId: session.id,
      paymentStatus: session.payment_status,
      customerEmail: session.customer_email,
      amountTotal: session.amount_total,
      receiptUrl: receiptUrl,
    });

  } catch (error) {
    // Stripe が "存在しない session_id" 等で投げる invalid_request_error は
    // クライアント由来の入力誤りなので 400 として返す。
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      return NextResponse.json(
        { error: 'invalid session_id' },
        { status: 400 }
      );
    }

    console.error('Failed to retrieve session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
