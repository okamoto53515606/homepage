'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lock, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/auth/auth-provider';

/**
 * 有料記事のペイウォールコンポーネント
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
 * Next.jsのサーバーコンポーネントのキャッシュにより、
 * ログイン後やリダイレクト後にPaywallが誤表示されることがある。
 * クライアントサイドでアクセス権を再チェックし、
 * 購入済みユーザーには自動でリロードして記事を表示する。
 */
export default function Paywall() {
  const { user, loading, signIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);

  // クライアントサイドでアクセス権を再チェック
  // サーバーコンポーネントのキャッシュ問題を解決
  useEffect(() => {
    async function checkAccessAndReload() {
      // ログイン中または未ログインの場合はチェック不要
      if (loading || !user?.isLoggedIn) {
        setIsCheckingAccess(false);
        return;
      }

      // クライアントサイドのユーザーロールをチェック
      // AuthProviderが最新のFirestoreデータからロールを判定している
      if (user.role === 'paid_member' || user.role === 'admin') {
        console.log('[Paywall] User has access, reloading page...');
        // 購入済みユーザーなのにPaywallが表示された場合はリロード
        // これによりサーバーコンポーネントが再実行され、記事が表示される
        window.location.reload();
        return;
      }

      setIsCheckingAccess(false);
    }

    checkAccessAndReload();
  }, [user, loading]);

  const handlePurchase = async () => {
    // 未ログインの場合はログインを促す（この状態でボタンは表示されないはずだが念のため）
    if (!user?.isLoggedIn || !user?.uid) {
      setError('購入するにはログインが必要です');
      return;
    }

    setIsLoading(true);
    setError(null);

    // 現在のページURLを保存（購入完了後に戻るため）
    const returnUrl = window.location.pathname;

    try {
      // Checkout セッション作成 API を呼び出し
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.uid,
          userEmail: user.email,
          returnUrl: returnUrl, // 購入完了後に戻るURL
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '決済の開始に失敗しました');
      }

      // Stripe Checkout 画面にリダイレクト
      // SBPSリンク型の「フォームPOST後のリダイレクト」に相当
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('決済URLの取得に失敗しました');
      }
    } catch (err) {
      console.error('Purchase error:', err);
      setError(err instanceof Error ? err.message : '決済の開始に失敗しました');
      setIsLoading(false);
    }
  };

  // ローディング中 または アクセス権チェック中
  if (loading || isCheckingAccess) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {isCheckingAccess ? 'アクセス権を確認中...' : '読み込み中...'}
          </p>
        </div>
      </div>
    );
  }

  const isLoggedIn = user?.isLoggedIn ?? false;

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Card className="w-full max-w-md text-center shadow-lg">
        <CardHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="mt-4 font-headline text-2xl">
            これは有料記事です
          </CardTitle>
          <CardDescription>
            一度のお支払いで全ての有料記事を30日間読み放題。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-4xl font-bold">¥500</p>
          <p className="text-sm text-muted-foreground">30日間アクセス可能</p>
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          {isLoggedIn ? (
            // ログイン済み: 購入ボタンを表示
            <Button 
              className="w-full" 
              size="lg" 
              onClick={handlePurchase}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  処理中...
                </>
              ) : (
                '購入する'
              )}
            </Button>
          ) : (
            // 未ログイン: まずログインを促す
            <>
              <p className="text-sm text-muted-foreground">
                有料記事を読むにはログインが必要です
              </p>
              <Button className="w-full" size="lg" onClick={signIn}>
                Googleでログインして購入
              </Button>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
