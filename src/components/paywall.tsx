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
            This is a premium article
          </CardTitle>
          <CardDescription>
            Unlock this article and support our work with a one-time payment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-4xl font-bold">$1.99</p>
          <p className="text-sm text-muted-foreground">for 72-hour access</p>
        </CardContent>
        <CardFooter>
          <Button className="w-full" size="lg">
            Purchase Access with Stripe
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
