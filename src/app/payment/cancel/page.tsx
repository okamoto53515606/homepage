import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XCircle } from 'lucide-react';
import Link from 'next/link';

/**
 * 決済キャンセルページ
 * 
 * Stripe Checkout でユーザーがキャンセルした場合にリダイレクトされるページ。
 */
export default function PaymentCancelPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center py-12">
      <Card className="w-full max-w-md text-center shadow-lg">
        <CardHeader>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <XCircle className="h-10 w-10 text-gray-500" />
          </div>
          <CardTitle className="mt-4 font-headline text-2xl">
            お支払いがキャンセルされました
          </CardTitle>
          <CardDescription className="text-base">
            決済は完了していません。いつでも再度お試しいただけます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              ご不明な点がございましたら、お気軽にお問い合わせください。
            </p>
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
