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
 * ユーザー情報はサーバーから取得してpropsで渡します。
 * インタラクティブな部分はクライアントコンポーネントに委譲します。
 */

import { getUser } from '@/lib/auth';
import { PaywallClient } from './paywall-client';

export default async function Paywall() {
  // サーバーサイドでユーザー情報を取得
  const user = await getUser();
  
  // サーバーサイドでアクセス権がある場合は何も表示しない
  // （記事ページ側で適切にハンドリングされるべき）
  if (user && (user.role === 'paid_member' || user.role === 'admin')) {
    return null;
  }
  
  return <PaywallClient user={user} />;
}
