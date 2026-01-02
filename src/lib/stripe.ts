/**
 * Stripe サーバーサイドSDK
 * 
 * Stripe決済のサーバーサイド処理を提供します。
 * 
 * 【課金プラン】
 * - 金額: Firestoreの `settings/site_config` から取得
 * - 有効期間: Firestoreの `settings/site_config` から取得
 * - 方式: 都度課金（サブスクではない）
 * 
 * 【決済フロー】
 * 1. /api/stripe/checkout で Checkout セッション作成
 * 2. Stripeの決済画面にリダイレクト
 * 3. Webhook (checkout.session.completed) でアクセス権付与
 */

import Stripe from 'stripe';
import { getSiteSettings } from './settings';

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
 * 課金設定（基本設定）
 */
export const BASE_PAYMENT_CONFIG = {
  /** 通貨 */
  currency: 'jpy',
  /** 商品名 */
  productName: '有料記事アクセス権',
  /** 商品説明 */
  productDescription: '全ての有料記事を読み放題',
} as const;

/**
 * Firestoreから動的な課金設定（金額、日数）を取得する
 * @returns {Promise<{amount: number, accessDays: number}>}
 */
export async function getDynamicPaymentConfig() {
  const settings = await getSiteSettings();
  return {
    amount: settings?.paymentAmount || 0, // デフォルト値を0に変更
    accessDays: settings?.accessDurationDays || 0, // デフォルト値を0に変更
  };
}
