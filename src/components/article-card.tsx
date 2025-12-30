/**
 * 記事カードコンポーネント
 * 
 * 記事一覧ページで使用されるカード形式の記事プレビューです。
 * - サムネイル画像
 * - タイトル
 * - 概要
 * - 有料/無料バッジ
 * - 「続きを読む」リンク
 */

import Link from 'next/link';
import Image from 'next/image';
import type { Article } from '@/lib/data';

interface ArticleCardProps {
  /** 表示する記事データ */
  article: Article & { imageUrl?: string; imageHint?: string };
}

export default function ArticleCard({ article }: ArticleCardProps) {
  return (
    <Link href={`/articles/${article.slug}`} className="article-card">
      {/* サムネイル画像 */}
      {article.imageUrl && (
        <div className="article-card__image">
          <Image
            src={article.imageUrl}
            alt={article.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            data-ai-hint={article.imageHint}
          />
        </div>
      )}

      {/* コンテンツ */}
      <div>
        <h2>{article.title}</h2>
        <p>{article.excerpt}</p>
      </div>

      {/* フッター */}
      <div className="article-card__footer">
        <span data-access={article.access}>
          {article.access === 'paid' ? '有料' : '無料'}
        </span>
        <span>
          続きを読む →
        </span>
      </div>
    </Link>
  );
}
