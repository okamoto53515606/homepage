import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

/**
 * Stripe Checkout セッション情報取得 API
 * 
 * 決済完了後に領収書URLなどを取得するために使用
 * 
 * リクエスト例:
 * GET /api/stripe/session?session_id=cs_test_xxx
 */
export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'session_id is required' },
        { status: 400 }
      );
    }

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
    console.error('Failed to retrieve session:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
