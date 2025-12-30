'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Receipt, Loader2 } from 'lucide-react';
import Link from 'next/link';

/**
 * 決済成功ページ
 * 
 * Stripe Checkout 完了後にリダイレクトされるページ。
 * URLパラメータに session_id が含まれる。
 * 
 * 注意: このページはあくまで「決済完了の通知」であり、
 * アクセス権の付与は Webhook (checkout.session.completed) で行う。
 * ユーザーがこのページに到達する前にWebhookが処理されている保証はないため、
 * クリティカルな処理はWebhookで行うこと。
 */
export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSessionInfo() {
      if (!sessionId) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/stripe/session?session_id=${sessionId}`);
        const data = await response.json();
        
        if (data.receiptUrl) {
          setReceiptUrl(data.receiptUrl);
        }
      } catch (error) {
        console.error('Failed to fetch session info:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSessionInfo();
  }, [sessionId]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center py-12">
      <Card className="w-full max-w-md text-center shadow-lg">
        <CardHeader>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <CardTitle className="mt-4 font-headline text-2xl">
            お支払いが完了しました
          </CardTitle>
          <CardDescription className="text-base">
            ありがとうございます！30日間、全ての有料記事をお読みいただけます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 領収書ダウンロードリンク */}
          <div className="rounded-lg bg-muted p-4">
            {loading ? (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                領収書を取得中...
              </div>
            ) : receiptUrl ? (
              <a
                href={receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <Receipt className="h-4 w-4" />
                領収書を表示・ダウンロード
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">
                領収書はご登録のメールアドレスに送信されます。
              </p>
            )}
          </div>
          <div className="text-left text-sm text-muted-foreground">
            <p>• 有料記事が30日間読み放題になります</p>
            <p>• 期限が切れた場合は再度購入できます</p>
            <p>• 既存の期限がある場合は延長されます</p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button asChild className="w-full" size="lg">
            <Link href="/">トップページへ戻る</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
