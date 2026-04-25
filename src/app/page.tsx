/**
 * ホームページ（記事一覧）
 * 
 * サイトのトップページです。
 * 全ての記事をカード形式で表示します（カーソルベースのページネーション対応）。
 */

import { getArticles, type Article } from '@/lib/data';
import { getSiteSettings } from '@/lib/settings';
import ArticleCard from '@/components/article-card';
import Pagination from '@/components/pagination';
import type { Metadata } from 'next';

/**
 * 動的なメタデータ生成
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const siteName = settings?.siteName || '';
  
  return {
    title: settings?.metaTitle || siteName,
    description: settings?.metaDescription,
    alternates: {
      canonical: '/',
    },
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const cursor = typeof params?.cursor === 'string' ? params.cursor : undefined;

  // 記事データとサイト設定を並行取得
  const [{ articles, nextCursor }, settings] = await Promise.all([
    getArticles({ cursor, limit: 30 }),
    getSiteSettings(),
  ]);

  const siteName = settings?.siteName || ''

  return (
    <div className="page-section container">
      <h1>{siteName}</h1>
      
      {/* サイトの説明文を表示 */}
      {settings?.metaDescription && (
        <div className="site-description">
          {settings.metaDescription}
        </div>
      )}

      {articles.length > 0 ? (
        <>
          <div className="article-list">
            {articles.map((article: Article, index: number) => (
              <ArticleCard key={article.id} article={article} priority={index < 3} />
            ))}
          </div>
          
          <Pagination
            basePath="/"
            nextCursor={nextCursor}
            hasPrevious={!!cursor}
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
