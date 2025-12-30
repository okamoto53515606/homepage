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
 * 【キャッシュ問題の解決】
 * Next.js のサーバーコンポーネントのキャッシュにより、
 * ログイン後やリダイレクト後に Paywall が誤表示されることがあります。
 * クライアントサイドでアクセス権を再チェックし、
 * 購入済みユーザーには自動でリロードして記事を表示します。
 */
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth/auth-provider';

export default function Paywall() {
  const { user, loading, signIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);

  /**
   * クライアントサイドでアクセス権を再チェック
   * サーバーコンポーネントのキャッシュ問題を解決
   */
  useEffect(() => {
    async function checkAccessAndReload() {
      // ログイン中または未ログインの場合はチェック不要
      if (loading || !user?.isLoggedIn) {
        setIsCheckingAccess(false);
        return;
      }

      // 購入済みユーザーなのに Paywall が表示された場合はリロード
      if (user.role === 'paid_member' || user.role === 'admin') {
        console.log('[Paywall] User has access, reloading page...');
        window.location.reload();
        return;
      }

      setIsCheckingAccess(false);
    }

    checkAccessAndReload();
  }, [user, loading]);

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

  // ローディング中
  if (loading || isCheckingAccess) {
    return (
      <div className="loading">
        <p>
          {isCheckingAccess ? 'アクセス権を確認中...' : '読み込み中...'}
        </p>
      </div>
    );
  }

  const isLoggedIn = user?.isLoggedIn ?? false;

  return (
    <div className="paywall">
      <div>
        {/* 鍵アイコン */}
        <div className="paywall__icon">🔒</div>
        <h2>これは有料記事です</h2>
        <p>
          一度のお支払いで全ての有料記事を30日間読み放題。
        </p>
      </div>

      <div className="paywall__pricing">
        <p className="paywall__price">¥500</p>
        <p>30日間アクセス可能</p>
        {error && <p className="error-text">{error}</p>}
      </div>

      <div>
        {isLoggedIn ? (
          // ログイン済み: 購入ボタンを表示
          <button
            onClick={handlePurchase}
            disabled={isLoading}
            className="btn btn--primary btn--full"
          >
            {isLoading ? '処理中...' : '購入する'}
          </button>
        ) : (
          // 未ログイン: まずログインを促す
          <>
            <p>
              有料記事を読むにはログインが必要です
            </p>
            <button
              onClick={signIn}
              className="btn btn--primary btn--full"
            >
              Googleでログインして購入
            </button>
          </>
        )}
      </div>
    </div>
  );
}
