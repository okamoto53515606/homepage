/**
 * ホームページ（記事一覧）
 * 
 * サイトのトップページです。
 * 全ての記事をカード形式のグリッドで表示します。
 */

import { getArticles, type Article } from '@/lib/data';
import ArticleCard from '@/components/article-card';

export default async function Home() {
  // 記事データを取得
  const articles = await getArticles();

  return (
    <div className="page-section">
      {/* ページタイトル */}
      <h1>注目の記事</h1>

      {/* 記事グリッド */}
      {articles.length > 0 ? (
        <div className="article-grid">
          {articles.map((article: Article) => (
            <ArticleCard key={article.id} article={article} />
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
