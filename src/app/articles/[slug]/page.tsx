/**
 * 記事詳細ページ
 * 
 * 個別の記事を表示するページです。
 * - 無料記事: 全員に表示
 * - 有料記事: 購入済み会員または管理者のみ表示
 * - 未購入者: ペイウォールを表示
 * 
 * コメントセクションも含みます。
 */

import { getArticleBySlug } from '@/lib/data';
import { notFound } from 'next/navigation';
import { getUser } from '@/lib/auth';
import ArticleDisplay from '@/components/article-display';
import Paywall from '@/components/paywall';
import CommentSection from '@/components/comment-section';

// キャッシュ無効化: ユーザーのアクセス権を毎回チェック
export const dynamic = 'force-dynamic';

interface ArticlePageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  // Next.js 15: params は Promise なので await が必要
  const { slug } = await params;

  // 記事データとユーザー情報を並行取得
  const [article, user] = await Promise.all([
    getArticleBySlug(slug),
    getUser(),
  ]);

  // 記事が存在しない場合は 404
  if (!article) {
    notFound();
  }

  // アクセス権のチェック
  const canAccess =
    article.access === 'free' ||
    user.role === 'paid_member' ||
    user.role === 'admin';

  return (
    <div className="page-section--large">
      <div className="container--narrow">
        {canAccess ? (
          <>
            {/* 記事本文 */}
            <ArticleDisplay article={article} />
            
            {/* セパレータ */}
            <hr className="separator" />
            
            {/* コメントセクション */}
            <CommentSection comments={article.comments} />
          </>
        ) : (
          /* ペイウォール */
          <Paywall />
        )}
      </div>
    </div>
  );
}
