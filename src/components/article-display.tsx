/**
 * 記事表示コンポーネント
 * 
 * 記事詳細ページで記事のフルコンテンツを表示します。
 * - タイトル, 公開日
 * - Markdown コンテンツ（react-markdown でレンダリング）
 * - タグ（記事下部に表示）
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// why: CommonMark は閉じ ** の直前が「」（）などの CJK 約物で直後がひらがな等の場合に
//      強調として認識しない。日本語記事では **「用語」**のように が頻出するため
//      remark-cjk-friendly で補正する。非 CJK テキストへの影響はない。
import remarkCjkFriendly from 'remark-cjk-friendly';
import type { Article } from '@/lib/data';
import Link from 'next/link';

/**
 * ISO 8601 タイムスタンプを読みやすい形式にフォーマットする (JST)
 */
function formatTimestamp(timestamp: string): string {
  if (!timestamp) return '日付不明';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '日付不明';
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
          <span>公開日: {formatTimestamp(article.createdAt)}</span>
        </div>
      </header>

      {/* 記事本文: Markdown をレンダリング */}
      <div className="article__content">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkCjkFriendly]}>
          {article.content}
        </ReactMarkdown>
      </div>

      {/* 区切り線 */}
      <hr className="separator" />

      {/* タグ */}
      {article.tags && article.tags.length > 0 && (
        <div className="article__meta" style={{ marginTop: '16px' }}>
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
        </div>
      )}

      {/* トップページへ戻るボタン */}
      <div className="article__footer-actions">
        <Link href="/" className="btn btn--home">
          トップページへ
        </Link>
      </div>
    </article>
  );
}
