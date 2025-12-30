import { loadStripe, Stripe } from '@stripe/stripe-js';

/**
 * Stripe クライアントサイド SDK インスタンス（シングルトン）
 * 
 * 注意: このファイルはクライアントサイドでのみ使用してください。
 * NEXT_PUBLIC_ プレフィックスの公開キーを使用します。
 */
let stripePromise: Promise<Stripe | null>;

export const getStripe = () => {
  if (!stripePromise) {
    // 環境変数名を NEXT_PUBLIC_ に変更する必要があります
    // 現在は STRIPE_PUBLIC_KEY なので、サーバーサイドから渡す方式を採用
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY!);
  }
  return stripePromise;
};
