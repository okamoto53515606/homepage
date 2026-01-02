import { NextRequest, NextResponse } from 'next/server';
import { stripe, BASE_PAYMENT_CONFIG, getDynamicPaymentConfig } from '@/lib/stripe';
import { headers } from 'next/headers';

/**
 * クライアントのIPアドレスを取得する
 * 
 * - App Hosting環境: 'x-fah-client-ip' ヘッダーを使用
 * - 開発環境など: '0.0.0.0' を返す
 */
async function getClientIp() {
  const headersList = await headers();
  return headersList.get('x-fah-client-ip') || '0.0.0.0';
}

/**
 * Stripe Checkout セッション作成 API
 * 
 * SBPSリンク型との対比:
 * - SBPS: HTMLフォームにhidden値を埋めてPOST + ハッシュ計算
 * - Stripe: REST API (JSON) でセッション作成 → URLにリダイレクト
 * 
 * リクエスト例:
 * POST /api/stripe/checkout
 * { "userId": "firebase-uid-xxx", "userEmail": "user@example.com" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, userEmail, returnUrl } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }
    
    // Firestoreから動的な設定（金額、日数）を取得
    const { amount, accessDays } = await getDynamicPaymentConfig();

    // 成功・キャンセル時の戻りURL
    const origin = request.headers.get('origin') || 'http://localhost:9002';
    // 元の記事URLをクエリパラメータに含める
    const encodedReturnUrl = returnUrl ? encodeURIComponent(returnUrl) : '';
    const successUrl = `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}${encodedReturnUrl ? `&return_url=${encodedReturnUrl}` : ''}`;
    const cancelUrl = returnUrl ? `${origin}${returnUrl}` : `${origin}/payment/cancel`;
    
    // IPアドレスを取得
    const clientIp = await getClientIp();

    /**
     * Stripe Checkout セッション作成
     * 
     * SBPSとの対比:
     * - merchant_id, service_id → 不要（APIキーで認証）
     * - cust_code → client_reference_id（ユーザー識別用）
     * - order_id → metadata.order_id（任意の追加情報）
     * - job_cd: CAPTURE → mode: 'payment'（即時売上）
     * - amount → line_items[].price_data.unit_amount
     */
    const session = await stripe.checkout.sessions.create({
      // 決済方法: クレジットカードのみ
      payment_method_types: ['card'],
      
      // 商品情報
      line_items: [
        {
          price_data: {
            currency: BASE_PAYMENT_CONFIG.currency,
            product_data: {
              name: `${BASE_PAYMENT_CONFIG.productName}（${accessDays}日間）`,
              description: BASE_PAYMENT_CONFIG.productDescription,
            },
            unit_amount: amount, // 動的に取得した金額
          },
          quantity: 1,
        },
      ],

      // 決済モード: 都度課金（即時売上確定）
      // SBPSの job_cd: CAPTURE に相当
      mode: 'payment',

      // 成功・キャンセル時のリダイレクト先
      // SBPSの success_url, cancel_url と同じ概念
      success_url: successUrl,
      cancel_url: cancelUrl,

      // ユーザー識別情報
      // SBPSの cust_code に相当
      client_reference_id: userId,

      // メールアドレス（レシート送信用）
      customer_email: userEmail,

      // 電話番号の収集を有効化
      // VISAなどカード会社への連携で必要な場合があります
      phone_number_collection: {
        enabled: true,
      },

      // 追加のメタデータ（Webhook で参照可能）
      metadata: {
        userId: userId,
        accessDays: String(accessDays), // 動的に取得した日数
        clientIp: clientIp, // IPアドレスをメタデータに含める
      },

      // 利用規約への同意収集（環境変数で有効化）
      // Stripeダッシュボードで利用規約URLを設定後、環境変数 STRIPE_TERMS_OF_SERVICE_ENABLED=1 を設定
      // Checkout画面に「支払うことで利用規約に同意します」等の表示が出ます
      ...(process.env.STRIPE_TERMS_OF_SERVICE_ENABLED === '1' && {
        consent_collection: {
          terms_of_service: 'required' as const,
        },
      }),

      // 日本語ロケール
      locale: 'ja',
    });

    // セッションURLを返す（クライアントはこのURLにリダイレクト）
    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });

  } catch (error) {
    console.error('Stripe Checkout Session creation failed:', error);
    
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
