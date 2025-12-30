import { NextRequest, NextResponse } from 'next/server';
import { stripe, PAYMENT_CONFIG } from '@/lib/stripe';
import { grantAccessToUserAdmin, createPaymentRecord } from '@/lib/user-access-admin';
import Stripe from 'stripe';

/**
 * Stripe Webhook 受信 API
 * 
 * SBPSとの対比:
 * - SBPS: 入金通知 / 決済結果通知（IP制限 + ベーシック認証）
 * - Stripe: Webhook（署名検証 HMAC-SHA256）
 * 
 * 重要: Next.js App Router では、Webhook の生データを取得するために
 * request.text() を使用する必要があります。
 */
export async function POST(request: NextRequest) {
  try {
    // 生のリクエストボディを取得（署名検証に必要）
    const body = await request.text();
    
    // Stripe からの署名ヘッダー
    const signature = request.headers.get('stripe-signature');
    
    if (!signature) {
      console.error('Webhook: Missing stripe-signature header');
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    // 署名検証
    // SBPSのハッシュ検証に相当するが、Stripe SDKが自動で行う
    let event: Stripe.Event;
    
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json(
        { error: 'Webhook signature verification failed' },
        { status: 400 }
      );
    }

    // イベントタイプに応じた処理
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }
      
      default:
        console.log(`Webhook: Unhandled event type: ${event.type}`);
    }

    // Stripe に成功を返す（必須）
    // 2xx を返さないと Stripe がリトライし続ける
    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('Webhook processing failed:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

/**
 * checkout.session.completed イベントのハンドラ
 * 
 * 決済完了時に呼ばれる。ここでユーザーにアクセス権を付与し、決済履歴を作成する。
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log('=== Checkout Session Completed ===');
  console.log('Session ID:', session.id);
  console.log('Payment Status:', session.payment_status);
  console.log('Client Reference ID (userId):', session.client_reference_id);

  // 決済が完了していることを確認
  if (session.payment_status !== 'paid') {
    console.log('Payment not completed, skipping access grant');
    return;
  }

  // ユーザーIDを取得
  const userId = session.client_reference_id || session.metadata?.userId;
  
  if (!userId) {
    console.error('No userId found in session');
    return;
  }

  // アクセス日数を取得
  const accessDays = session.metadata?.accessDays 
    ? parseInt(session.metadata.accessDays, 10) 
    : PAYMENT_CONFIG.accessDays;

  // 決済履歴をFirestoreに記録（Admin SDK使用 - セキュリティルールをバイパス）
  try {
    const paymentData = {
      user_id: userId,
      stripe_session_id: session.id,
      stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
      amount: session.amount_total,
      currency: session.currency,
      status: session.payment_status,
      ip_address: session.metadata?.clientIp || '0.0.0.0', // Checkout時に含めたIPアドレス
      created_at: new Date(session.created * 1000), // Stripeのタイムスタンプは秒単位
    };
    const paymentId = await createPaymentRecord(paymentData);
    console.log(`Payment history created with ID: ${paymentId}`);

    // ユーザーにアクセス権を付与（Admin SDK使用）
    await grantAccessToUserAdmin(userId, accessDays);
    console.log(`Access granted to user ${userId} for ${accessDays} days`);

  } catch (error) {
    console.error('Failed to update Firestore:', error);
    // ここでエラーが発生した場合、Stripeに500エラーを返してリトライさせることも検討
    throw error;
  }
}
