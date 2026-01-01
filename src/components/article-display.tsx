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

/**
 * タイムスタンプを読みやすい形式にフォーマットする
 */
function formatTimestamp(timestamp: any): string {
  if (!timestamp || !timestamp.toDate) return '日付不明';
  return timestamp.toDate().toLocaleDateString('ja-JP');
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
              <span>タグ: {article.tags.join(', ')}</span>
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
