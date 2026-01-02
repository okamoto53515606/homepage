/**
 * 記事カードコンポーネント
 * 
 * 記事一覧ページで使用されるカード形式の記事プレビューです。
 * - タイトル, 概要, タグ, 最終更新日
 * - 有料/無料バッジ
 * 
 *【レイアウト変更】
 * 画像をなくし、テキスト情報のみのシンプルな表示に変更しました。
 */

import Link from 'next/link';
import type { Article } from '@/lib/data';
import { Tag } from 'lucide-react';

/**
 * タイムスタンプを読みやすい形式にフォーマットする（JST）
 */
function formatTimestamp(timestamp: any): string {
  if (!timestamp || !timestamp.toDate) return '日付不明';
  const date = timestamp.toDate();
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export default function ArticleCard({ article, priority = false }: { article: Article, priority?: boolean }) {
  // 変更：classNameからflexプロパティを削除し、コンテンツが縦に並ぶようにする
  return (
    <Link href={`/articles/${article.slug}`} className="article-card" style={{ display: 'block' }}>
      
      {/* 
        変更：画像ラッパーを削除
      */}
      
      {/* コンテンツ */}
      <div className="article-card__content">
        <h2>{article.title}</h2>
        <p>{article.excerpt}</p>
        
        {/* タグ表示 */}
        {article.tags && article.tags.length > 0 && (
          <div className="article-card__tags">
            <Tag size={14} />
            {article.tags.join(', ')}
          </div>
        )}
      </div>

      {/* フッター */}
      <div className="article-card__footer">
        <span className={`article-card__badge article-card__badge--${article.access}`}>
          {article.access === 'paid' ? '有料' : '無料'}
        </span>
        <span className="article-card__date">
          {formatTimestamp(article.updatedAt)}
        </span>
      </div>
    </Link>
  );
}
