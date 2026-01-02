'use client';

/**
 * 決済成功ページ
 * 
 * @description
 * Stripe Checkout 完了後にリダイレクトされるページ。
 * URLパラメータに session_id が含まれる。
 * 
 * 注意: このページはあくまで「決済完了の通知」であり、
 * アクセス権の付与は Webhook (checkout.session.completed) で行う。
 * ユーザーがこのページに到達する前にWebhookが処理されている保証はないため、
 * クリティカルな処理はWebhookで行うこと。
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, Receipt, Loader2 } from 'lucide-react';

/**
 * 決済成功コンテンツ
 * useSearchParams を使用するため Suspense でラップが必要
 */
function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const returnUrl = searchParams.get('return_url');
  
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  /**
   * セッション情報を取得して領収書URLを取得
   */
  useEffect(() => {
    async function fetchSessionInfo() {
      if (!sessionId) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/stripe/session?session_id=${sessionId}`);
        const data = await response.json();
        setSessionInfo(data);
      } catch (error) {
        console.error('Failed to fetch session info:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSessionInfo();
  }, [sessionId]);

  const accessDays = sessionInfo?.metadata?.accessDays || 30; // フォールバック

  return (
    <div className="payment-result">
      <div className="payment-result__card">
        {/* 成功アイコン */}
        <div>
          <div className="payment-result__icon payment-result__icon--success">
            <CheckCircle size={48} />
          </div>
          <h1>お支払いが完了しました</h1>
          <p>
            ありがとうございます！全ての有料記事をお読みいただけます。
          </p>
        </div>

        {/* 領収書セクション */}
        <div className="payment-result__receipt">
          <div>
            {loading ? (
              <div className="loading-inline">
                <Loader2 size={16} className="loading-spin" />
                <span>領収書を取得中...</span>
              </div>
            ) : sessionInfo?.receiptUrl ? (
              <a
                href={sessionInfo.receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="receipt-link"
              >
                <Receipt size={16} />
                <span>領収書を表示・ダウンロード</span>
              </a>
            ) : (
              <p>
                領収書はご登録のメールアドレスに送信されます。
              </p>
            )}
          </div>
        </div>

        {/* アクションボタン */}
        <div className="payment-result__actions">
          {returnUrl ? (
            <>
              <button 
                onClick={() => window.location.href = returnUrl}
                className="btn btn--primary btn--full"
              >
                記事を読む
              </button>
              <button 
                onClick={() => window.location.href = '/'}
                className="btn btn--secondary btn--full"
              >
                トップページへ
              </button>
            </>
          ) : (
            <button 
              onClick={() => window.location.href = '/'}
              className="btn btn--primary btn--full"
            >
              トップページへ戻る
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 決済成功ページ（エクスポート）
 * useSearchParams を使用するコンテンツを Suspense でラップ
 */
export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="loading">
        <Loader2 size={32} className="loading-spin" />
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  );
}
