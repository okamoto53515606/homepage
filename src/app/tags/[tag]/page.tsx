/**
 * タグ別記事一覧ページ
 * 
 * 指定されたタグを持つ記事を一覧表示します。
 * カーソルベースのページネーションに対応しています。
 * 
 * 【サーバーコンポーネント】
 * 記事データはサーバーで取得し、HTMLとして配信されます。
 */

import { getArticles, type Article } from '@/lib/data';
import { getSiteSettings } from '@/lib/settings';
import ArticleCard from '@/components/article-card';
import Pagination from '@/components/pagination';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

/** Next.js 15: params と searchParams は Promise 型 */
interface TagPageProps {
  params: Promise<{ tag: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * タグページ用の動的なメタデータ生成
 */
export async function generateMetadata({ params }: TagPageProps): Promise<Metadata> {
  const { tag: rawTag } = await params;
  const tag = decodeURIComponent(rawTag);
  const settings = await getSiteSettings();
  const siteName = settings?.siteName || '';

  return {
    title: `タグ「${tag}」の記事一覧 | ${siteName}`,
    description: `タグ「${tag}」に関する記事の一覧です。`,
    alternates: {
      canonical: `/tags/${tag}`,
    },
  };
}


export default async function TagPage({ params, searchParams }: TagPageProps) {
  const { tag: rawTag } = await params;
  const resolvedSearchParams = await searchParams;
  const tag = decodeURIComponent(rawTag);
  const cursor = typeof resolvedSearchParams?.cursor === 'string' ? resolvedSearchParams.cursor : undefined;

  const { articles, nextCursor } = await getArticles({ 
    cursor,
    limit: 30, 
    tag 
  });

  if (articles.length === 0) {
    notFound();
  }

  return (
    <div className="page-section container">
      <h1>タグ: {tag}</h1>

      <div className="article-list">
        {articles.map((article: Article, index: number) => (
          <ArticleCard key={article.id} article={article} priority={index < 3} />
        ))}
      </div>

      <Pagination
        basePath={`/tags/${tag}`}
        nextCursor={nextCursor}
        hasPrevious={!!cursor}
      />
    </div>
  );
}
