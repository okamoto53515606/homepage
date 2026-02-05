/**
 * ペイウォールコンポーネント
 * 
 * 有料記事にアクセスしようとした未購入ユーザーに表示します。
 * 
 * 【決済フロー】
 * 1. ユーザーが「購入する」ボタンをクリック
 * 2. /api/stripe/checkout に POST リクエスト
 * 3. Stripe Checkout セッションが作成される
 * 4. ユーザーは Stripe の決済画面にリダイレクト
 * 5. 決済完了後、/payment/success にリダイレクト
 * 6. Webhook (checkout.session.completed) でアクセス権が付与される
 * 
 * 【サーバーコンポーネント】
 * ユーザー情報と動的な課金設定をサーバーから取得してpropsで渡します。
 * インタラクティブな部分はクライアントコンポーネントに委譲します。
 */

import { getUser } from '@/lib/auth';
import { getDynamicPaymentConfig } from '@/lib/stripe';
import { PaywallClient } from './paywall-client';
import { getSiteSettings } from '@/lib/settings';
import type { Article } from '@/lib/data';

interface PaywallProps {
  article: Article;
}

export default async function Paywall({ article }: PaywallProps) {
  // サーバーサイドでユーザー情報、課金設定、サイト設定を並行取得
  const [user, paymentConfig, settings] = await Promise.all([
    getUser(),
    getDynamicPaymentConfig(),
    getSiteSettings(),
  ]);
  
  // サーバーサイドでアクセス権がある場合は何も表示しない
  if (user && (user.role === 'paid_member' || user.role === 'admin')) {
    return null;
  }
  
  return (
    <PaywallClient 
      user={user} 
      paymentConfig={paymentConfig}
      termsOfServiceContent={settings?.termsOfServiceContent || ''}
      articleTitle={article.title}
    />
  );
}
