import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';

export default function Paywall() {
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
            一度のお支払いでこの記事のロックを解除し、私たちの活動を支援してください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-4xl font-bold">¥300</p>
          <p className="text-sm text-muted-foreground">72時間アクセス可能</p>
        </CardContent>
        <CardFooter>
          <Button className="w-full" size="lg">
            Stripeで購入
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
