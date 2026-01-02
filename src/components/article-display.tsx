/**
 * 記事表示コンポーネント
 * 
 * 記事詳細ページで記事のフルコンテンツを表示します。
 * - タイトル, タグ, 最終更新日
 * - Markdown コンテンツ（react-markdown でレンダリング）
 * 
 * 【サーバーコンポーネント】
 * このコンポーネントはサーバーでレンダリングされ、
 * HTMLとして配信されます。クライアントJSは不要です。
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Article } from '@/lib/data';
import Link from 'next/link';

/**
 * タイムスタンプを読みやすい形式にフォーマットする (JST)
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


export default function ArticleDisplay({ article }: { article: Article }) {
  return (
    <article>
      {/* ヘッダー: タイトル, メタ情報 */}
      <header className="article__header">
        <h1>{article.title}</h1>
        <div className="article__meta">
          <span>最終更新日: {formatTimestamp(article.updatedAt)}</span>
          {article.tags && article.tags.length > 0 && (
            <div className="article__tags">
              <span>タグ: </span>
              {article.tags.map((tag, index) => (
                <span key={tag}>
                  <Link href={`/tags/${tag}`} className="article__tag-link">
                    {tag}
                  </Link>
                  {index < article.tags.length - 1 && ', '}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* 記事本文: Markdown をレンダリング */}
      <div className="article__content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {article.content}
        </ReactMarkdown>
      </div>
    </article>
  );
}
