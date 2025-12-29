import { getUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ArticleGeneratorForm from '@/components/article-generator-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal } from 'lucide-react';

export default async function GenerateArticlePage() {
  const user = await getUser();

  if (user.role !== 'admin') {
    redirect('/');
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-12">
      <div className="space-y-4">
        <h1 className="font-headline text-4xl font-bold">
          記事生成ツール
        </h1>
        <p className="text-lg text-muted-foreground">
          コンテンツの目標とコンテキストを定義し、AIに下書きを生成させます。
        </p>
        <Alert>
          <Terminal className="h-4 w-4" />
          <AlertTitle>管理者アクセス</AlertTitle>
          <AlertDescription>
            あなたには管理者権限があるため、このページを閲覧できます。
          </AlertDescription>
        </Alert>
      </div>
      <div className="mt-8">
        <ArticleGeneratorForm />
      </div>
    </div>
  );
}
