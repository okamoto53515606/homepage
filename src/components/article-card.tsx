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
  /** 
   * ファーストビュー画像かどうか
   * - true: 即時読み込み（loading="eager", fetchpriority="high"）
   * - false: 遅延読み込み（loading="lazy"）
   * 
   * LCP最適化のため、1つ目の記事のみ true を指定
   */
  priority?: boolean;
}

export default function ArticleCard({ article, priority = false }: ArticleCardProps) {
  return (
    <Link href={`/articles/${article.slug}`} className="article-card">
      {/* 
        サムネイル画像
        
        priorityに応じて読み込み方法を切り替え:
        - priority=true: 即時読み込み（ファーストビュー用、LCP対策）
        - priority=false: 遅延読み込み（スクロール後に表示される画像）
      */}
      {article.imageUrl && (
        <div className="article-card__image">
          <Image
            src={article.imageUrl}
            alt={article.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            data-ai-hint={article.imageHint}
            loading={priority ? "eager" : "lazy"}
            priority={priority}
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
