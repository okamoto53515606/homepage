/**
 * ホームページ（記事一覧）
 * 
 * サイトのトップページです。
 * 全ての記事をカード形式で表示します（30件ごとのページネーション対応）。
 */

import { getArticles, type Article } from '@/lib/data';
import { getSiteSettings } from '@/lib/settings';
import ArticleCard from '@/components/article-card';
import Pagination from '@/components/pagination'; // ページネーションコンポーネント
import type { Metadata } from 'next';

const ARTICLES_PER_PAGE = 30;

/**
 * ページネーションに応じた動的なメタデータ生成
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}): Promise<Metadata> {
  const settings = await getSiteSettings();
  const page = Number(searchParams?.p || 1);
  const siteName = settings?.siteName || 'ホームページ';
  
  const title = page > 1 
    ? `${siteName} - ${page}ページ目`
    : settings?.metaTitle || siteName;
  
  return {
    title: title,
    description: settings?.metaDescription,
    // クエリパラメータを除いたURLを正規URLとして設定
    alternates: {
      canonical: '/',
    },
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const page = Number(searchParams?.p || 1);

  // 記事データとサイト設定を並行取得
  const [{ articles, totalCount }, settings] = await Promise.all([
    getArticles({ page, limit: ARTICLES_PER_PAGE }),
    getSiteSettings(),
  ]);

  const siteName = settings?.siteName || '注目の記事';
  const totalPages = Math.ceil(totalCount / ARTICLES_PER_PAGE);

  return (
    <div className="page-section container">
      <h1>{siteName}</h1>

      {articles.length > 0 ? (
        <>
          <div className="article-list">
            {articles.map((article: Article, index: number) => (
              <ArticleCard key={article.id} article={article} priority={index < 3} /> // 最初の3件を優先読み込み
            ))}
          </div>
          
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            basePath="/"
          />
        </>
      ) : (
        <p>
          現在、表示できる記事がありません。
        </p>
      )}
    </div>
  );
}
