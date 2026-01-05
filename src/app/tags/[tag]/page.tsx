/**
 * タグ別記事一覧ページ
 * 
 * 指定されたタグを持つ記事を一覧表示します。
 * ページネーションに対応しています。
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

const ARTICLES_PER_PAGE = 30;

/** Next.js 15: params と searchParams は Promise 型 */
interface TagPageProps {
  params: Promise<{ tag: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * タグページ用の動的なメタデータ生成
 */
export async function generateMetadata({ params, searchParams }: TagPageProps): Promise<Metadata> {
  const { tag: rawTag } = await params;
  const resolvedSearchParams = await searchParams;
  const tag = decodeURIComponent(rawTag);
  const page = Number(resolvedSearchParams?.p || 1);
  const settings = await getSiteSettings();
  const siteName = settings?.siteName || '';
  
  const title = page > 1
    ? `タグ「${tag}」の記事一覧 - ${page}ページ目 | ${siteName}`
    : `タグ「${tag}」の記事一覧 | ${siteName}`;

  return {
    title,
    description: `タグ「${tag}」に関する記事の一覧です。`,
    // クエリパラメータを除いたURLを正規URLとして設定
    alternates: {
      canonical: `/tags/${tag}`,
    },
  };
}


export default async function TagPage({ params, searchParams }: TagPageProps) {
  // Next.js 15: params と searchParams は Promise なので await が必要
  const { tag: rawTag } = await params;
  const resolvedSearchParams = await searchParams;
  const tag = decodeURIComponent(rawTag);
  const page = Number(resolvedSearchParams?.p || 1);

  const { articles, totalCount } = await getArticles({ 
    page, 
    limit: ARTICLES_PER_PAGE, 
    tag 
  });

  if (articles.length === 0) {
    // 記事が1件もなければ404ページを表示
    notFound();
  }

  const totalPages = Math.ceil(totalCount / ARTICLES_PER_PAGE);

  return (
    <div className="page-section container">
      <h1>タグ: {tag}</h1>

      <div className="article-list">
        {articles.map((article: Article, index: number) => (
          <ArticleCard key={article.id} article={article} priority={index < 3} />
        ))}
      </div>

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        basePath={`/tags/${tag}`}
      />
    </div>
  );
}
