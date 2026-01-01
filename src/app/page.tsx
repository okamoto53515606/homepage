/**
 * ホームページ（記事一覧）
 * 
 * サイトのトップページです。
 * 全ての記事をカード形式のグリッドで表示します。
 */

import { getArticles, type Article } from '@/lib/data';
import ArticleCard from '@/components/article-card';
import { getSiteSettings } from '@/lib/settings';

export default async function Home() {
  // 記事データとサイト設定を並行取得
  const [articles, settings] = await Promise.all([
    getArticles(),
    getSiteSettings(),
  ]);

  const siteName = settings?.siteName || '注目の記事';

  return (
    <div className="page-section">
      {/* サイト設定の siteName を表示 */}
      <h1>{siteName}</h1>

      {/* 
        記事グリッド
        
        【画像読み込み最適化】
        - 1つ目の記事: priority=true → 即時読み込み（LCP対策）
        - 2つ目以降: priority=false → 遅延読み込み（loading="lazy"）
      */}
      {articles.length > 0 ? (
        <div className="article-grid">
          {articles.map((article: Article, index: number) => (
            <ArticleCard key={article.id} article={article} priority={index === 0} />
          ))}
        </div>
      ) : (
        <p>
          現在、表示できる記事がありません。
        </p>
      )}
    </div>
  );
}
