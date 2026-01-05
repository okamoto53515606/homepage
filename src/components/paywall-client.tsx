/**
 * ペイウォールのクライアントコンポーネント
 * 
 * 購入ボタンやログインボタンなどのインタラクティブな部分を担当します。
 * ユーザー情報や課金設定はサーバーコンポーネントからpropsで受け取ります。
 */
'use client';

import { useState } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import type { UserInfo } from '@/lib/auth';

interface PaywallClientProps {
  /** サーバーから取得したユーザー情報 */
  user: UserInfo | null;
  /** サーバーから取得した課金設定 */
  paymentConfig: {
    amount: number;
    accessDays: number;
  };
  /** 利用規約のコンテンツ */
  termsOfServiceContent: string;
}

export function PaywallClient({ user, paymentConfig, termsOfServiceContent }: PaywallClientProps) {
  const { signIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 購入ボタンのクリックハンドラー
   * Stripe Checkout セッションを作成してリダイレクト
   */
  const handlePurchase = async () => {
    if (!user?.isLoggedIn || !user?.uid) {
      setError('購入するにはログインが必要です');
      return;
    }

    setIsLoading(true);
    setError(null);

    // 現在のページ URL を保存（購入完了後に戻るため）
    const returnUrl = window.location.pathname;

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          userEmail: user.email,
          returnUrl: returnUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '決済の開始に失敗しました');
      }

      // Stripe Checkout 画面にリダイレクト
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('決済 URL の取得に失敗しました');
      }
    } catch (err) {
      console.error('Purchase error:', err);
      setError(err instanceof Error ? err.message : '決済の開始に失敗しました');
      setIsLoading(false);
    }
  };

  const isLoggedIn = user?.isLoggedIn ?? false;

  return (
    <div className="paywall">
      <div>
        {/* 鍵アイコン */}
        <div className="paywall__icon">🔒</div>
        <h2>これは有料記事です</h2>
        <p>
          一度のお支払いで全ての有料記事を{paymentConfig.accessDays}日間読み放題。
        </p>
      </div>

      <div className="paywall__pricing">
        <p className="paywall__price">¥{paymentConfig.amount}</p>
        <p>{paymentConfig.accessDays}日間アクセス可能</p>
        {error && <p className="error-text">{error}</p>}
      </div>

      <div>
        {isLoggedIn ? (
          // ログイン済み: 購入ボタンを表示
          <>
            <p style={{ fontSize: '0.75rem', color: '#666', marginBottom: '1rem', textAlign: 'center' }}>
              <a href="/legal/commerce" target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc', textDecoration: 'underline' }}>特定商取引法に基づく表記</a>をご確認の上、決済へお進みください。
            </p>
            <button
              onClick={handlePurchase}
              disabled={isLoading}
              className="btn btn--primary btn--full"
            >
              {isLoading ? '処理中...' : '購入する'}
            </button>
          </>
        ) : (
          // 未ログイン: まずログインと利用規約の同意を促す
          <>
            <div className="terms-box">
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
                {termsOfServiceContent}
              </pre>
            </div>
            <p style={{ fontSize: '0.8rem', margin: '1rem 0' }}>
              ログインすることで、上記の利用規約に同意したものとみなされます。
            </p>
            <button
              onClick={signIn}
              className="btn btn--primary btn--full btn--text-center"
            >
              Googleでログインして購入
            </button>
          </>
        )}
      </div>
      {/* 利用規約表示用のスタイル */}
      <style jsx>{`
        .terms-box {
          height: 150px; /* 高さを指定 */
          overflow-y: auto; /* 縦スクロールを有効化 */
          border: 1px solid #ccc;
          padding: 1rem;
          margin-top: 1rem;
          text-align: left;
          font-size: 0.8rem;
          background-color: #f9f9f9;
        }
        /* スマホ向け: 余白を減らす */
        @media (max-width: 480px) {
          .terms-box {
            padding: 0.5rem;
            font-size: 0.75rem;
          }
        }
      `}</style>
    </div>
  );
}
