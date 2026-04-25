/**
 * 記事詳細ページ
 * 
 * 個別の記事を表示するページです。
 * - 無料記事: サーバーサイドで全文レンダリング（SEO対応）
 * - 有料記事: タイトル・メタ情報はサーバーサイド、本文はクライアントで取得（CDN対応）
 * 
 * CDN対応: getUser() / cookies() を使用せず、
 * ユーザー固有の情報はクライアントから /api で取得します。
 */

import { getArticleBySlug } from '@/lib/data';
import { notFound } from 'next/navigation';
import { getSiteSettings } from '@/lib/settings';
import ArticleDisplay from '@/components/article-display';
import CommentSection from '@/components/comment-section';
import PaidArticleContent from './paid-article-content';
import type { Metadata } from 'next';

interface ArticlePageProps {
  params: Promise<{
    slug: string;
  }>;
}

/**
 * 記事詳細ページの動的なメタデータ生成
 */
export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  
  if (!article) {
    return {
      title: '記事が見つかりません',
    };
  }

  return {
    title: article.title,
    description: article.excerpt,
    alternates: {
      canonical: `/articles/${slug}`,
    },
  };
}


export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;

  // 記事データとサイト設定を並行取得（cookies不使用 = CDNキャッシュ可能）
  const [article, settings] = await Promise.all([
    getArticleBySlug(slug),
    getSiteSettings(),
  ]);

  if (!article) {
    notFound();
  }

  const isFreeArticle = article.access === 'free';

  return (
    <div className="page-section--large">
      <div className="container--narrow">
        {isFreeArticle ? (
          <>
            {/* 無料記事: サーバーサイドで全文レンダリング（SEO対応） */}
            <ArticleDisplay article={article} />
            <hr className="separator" />
            <CommentSection 
              articleId={article.id}
              slug={slug}
              siteName={settings?.siteName || 'homepage'}
              termsOfServiceContent={settings?.termsOfServiceContent || ''}
            />
          </>
        ) : (
          /* 有料記事: クライアントでアクセス権を判定し、本文 or ペイウォールを表示 */
          <PaidArticleContent
            article={{
              id: article.id,
              title: article.title,
              excerpt: article.excerpt || '',
              tags: article.tags || [],
              createdAt: article.createdAt || '',
            }}
            slug={slug}
            siteName={settings?.siteName || 'homepage'}
            termsOfServiceContent={settings?.termsOfServiceContent || ''}
          />
        )}
      </div>
    </div>
  );
}
