/**
 * Stripe サーバーサイドSDK
 * 
 * Stripe決済のサーバーサイド処理を提供します。
 * 
 * 【課金プラン】
 * - 金額: 500円
 * - 有効期間: 30日間
 * - 方式: 都度課金（サブスクではない）
 * 
 * 【決済フロー】
 * 1. /api/stripe/checkout で Checkout セッション作成
 * 2. Stripeの決済画面にリダイレクト
 * 3. Webhook (checkout.session.completed) でアクセス権付与
 */

import Stripe from 'stripe';

/**
 * Stripe サーバーサイド SDK インスタンス
 * 
 * 注意: このファイルはサーバーサイドでのみ使用してください。
 * クライアントサイドでは @stripe/stripe-js の loadStripe を使用します。
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover', // 最新の安定版APIバージョン
  typescript: true,
});

/**
 * 課金設定（500円・30日切り売り）
 */
export const PAYMENT_CONFIG = {
  /** 金額（円） */
  amount: 500,
  /** 通貨 */
  currency: 'jpy',
  /** アクセス有効日数 */
  accessDays: 30,
  /** 商品名 */
  productName: '有料記事アクセス権（30日間）',
  /** 商品説明 */
  productDescription: '全ての有料記事を30日間読み放題',
} as const;
