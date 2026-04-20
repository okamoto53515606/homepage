/**
 * 有料記事コンテンツ（クライアントコンポーネント）
 * 
 * 有料記事について、/api/articles/[slug]/content でアクセス権を判定し、
 * 本文を表示するか、ペイウォールを表示するかを切り替えます。
 * 
 * CDN対応: サーバーサイドで cookies() / getUser() を使わないため、
 * このページのSSR結果はCDNでキャッシュ可能です。
 */
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { PaywallClient } from '@/components/paywall-client';
import CommentSection from '@/components/comment-section';

interface PaidArticleContentProps {
  article: {
    id: string;
    title: string;
    excerpt: string;
    tags: string[];
    createdAt: string;
  };
  slug: string;
  siteName: string;
  termsOfServiceContent: string;
}

function formatTimestamp(timestamp: string): string {
  if (!timestamp) return '日付不明';
  try {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  } catch {
    return '日付不明';
  }
}

export default function PaidArticleContent({ article, slug, siteName, termsOfServiceContent }: PaidArticleContentProps) {
  const { user: authUser } = useAuth();
  const [contentHtml, setContentHtml] = useState<string | null>(null);
  const [canAccess, setCanAccess] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [paymentConfig, setPaymentConfig] = useState({ amount: 0, accessDays: 0 });

  useEffect(() => {
    async function fetchContent() {
      setIsLoading(true);
      try {
        const [contentRes, userRes] = await Promise.all([
          fetch(`/api/articles/${slug}/content`),
          fetch('/api/auth/me'),
        ]);
        const userData = await userRes.json();
        setUser(userData);

        if (contentRes.ok) {
          const data = await contentRes.json();
          setContentHtml(data.contentHtml);
          setCanAccess(true);
        } else if (contentRes.status === 403) {
          setCanAccess(false);
          // 決済設定を取得
          try {
            const settingsRes = await fetch('/api/stripe/config');
            if (settingsRes.ok) {
              const config = await settingsRes.json();
              setPaymentConfig(config);
            }
          } catch {
            // 設定取得失敗時はデフォルト値を使用
          }
        }
      } catch {
        setCanAccess(false);
      } finally {
        setIsLoading(false);
      }
    }
    fetchContent();
  }, [slug, authUser]);

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem' }}>
        <Loader2 size={32} className="loading-spin" />
      </div>
    );
  }

  if (canAccess && contentHtml) {
    return (
      <>
        <article>
          <header className="article__header">
            <h1>{article.title}</h1>
            <div className="article__meta">
              <span>公開日: {formatTimestamp(article.createdAt)}</span>
            </div>
          </header>

          <div className="article__content" dangerouslySetInnerHTML={{ __html: contentHtml }} />

          <hr className="separator" />

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

          <div className="article__footer-actions">
            <Link href="/" className="btn btn--home">
              トップページへ
            </Link>
          </div>
        </article>

        <hr className="separator" />

        <CommentSection
          articleId={article.id}
          slug={slug}
          siteName={siteName}
          termsOfServiceContent={termsOfServiceContent}
        />
      </>
    );
  }

  // アクセス権なし: ペイウォールを表示
  return (
    <PaywallClient
      user={user}
      paymentConfig={paymentConfig}
      termsOfServiceContent={termsOfServiceContent}
      articleTitle={article.title}
    />
  );
}
