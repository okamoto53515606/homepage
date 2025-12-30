/**
 * 記事表示コンポーネント
 * 
 * 記事詳細ページで記事のフルコンテンツを表示します。
 * - タイトル
 * - メイン画像
 * - Markdown コンテンツ（react-markdown でレンダリング）
 * 
 * 【サーバーコンポーネント】
 * このコンポーネントはサーバーでレンダリングされ、
 * HTMLとして配信されます。クライアントJSは不要です。
 */

import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Article } from '@/lib/data';

interface ArticleDisplayProps {
  /** 表示する記事データ */
  article: Article & { imageUrl?: string; imageHint?: string };
}

export default function ArticleDisplay({ article }: ArticleDisplayProps) {
  return (
    <article>
      {/* ヘッダー: タイトルと画像 */}
      <header>
        <h1>{article.title}</h1>
        
        {article.imageUrl && (
          <div className="article__image">
            <Image
              src={article.imageUrl}
              alt={article.title}
              fill
              data-ai-hint={article.imageHint}
              priority
            />
          </div>
        )}
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
