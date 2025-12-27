import { getArticleBySlug } from '@/lib/data';
import { notFound } from 'next/navigation';
import { getUser } from '@/lib/auth';
import ArticleDisplay from '@/components/article-display';
import Paywall from '@/components/paywall';
import CommentSection from '@/components/comment-section';
import { Separator } from '@/components/ui/separator';

export const dynamic = 'force-dynamic'; // Ensure user role is checked on each request

interface ArticlePageProps {
  params: {
    slug: string;
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const [article, user] = await Promise.all([
    getArticleBySlug(params.slug),
    getUser(),
  ]);

  if (!article) {
    notFound();
  }

  const canAccess =
    article.access === 'free' ||
    user.role === 'paid_member' ||
    user.role === 'admin';

  return (
    <div className="py-12">
      <div className="container mx-auto max-w-3xl px-4">
        {canAccess ? (
          <>
            <ArticleDisplay article={article} />
            <Separator className="my-12" />
            <CommentSection comments={article.comments} />
          </>
        ) : (
          <Paywall />
        )}
      </div>
    </div>
  );
}
