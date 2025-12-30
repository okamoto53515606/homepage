/**
 * 決済キャンセルページ
 * 
 * @description
 * Stripe Checkout でユーザーがキャンセルした場合にリダイレクトされるページ。
 */

import { XCircle } from 'lucide-react';
import Link from 'next/link';

export default function PaymentCancelPage() {
  return (
    <div className="payment-result">
      <div className="payment-result__card">
        {/* キャンセルアイコン */}
        <div>
          <div className="payment-result__icon payment-result__icon--cancel">
            <XCircle size={48} />
          </div>
          <h1>お支払いがキャンセルされました</h1>
          <p>
            決済は完了していません。いつでも再度お試しいただけます。
          </p>
        </div>

        {/* メッセージ */}
        <div className="payment-result__message">
          <p>
            ご不明な点がございましたら、お気軽にお問い合わせください。
          </p>
        </div>

        {/* アクションボタン */}
        <div>
          <Link href="/" className="btn btn--primary btn--full">
            トップページへ戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
