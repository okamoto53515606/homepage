/**
 * 記事詳細ページ
 * 
 * 個別の記事を表示するページです。
 * - 無料記事: 全員に表示
 * - 有料記事: 購入済み会員または管理者のみ表示
 * - 未購入者: ペイウォールを表示
 * 
 * コメントセクションも含みます。
 */

import { getArticleBySlug, getCommentsForArticle, type Comment } from '@/lib/data';
import { notFound } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { getSiteSettings } from '@/lib/settings';
import ArticleDisplay from '@/components/article-display';
import Paywall from '@/components/paywall';
import CommentSection from '@/components/comment-section';
import type { Timestamp } from 'firebase-admin/firestore';
import type { Metadata } from 'next';


// キャッシュ無効化: ユーザーのアクセス権を毎回チェック
export const dynamic = 'force-dynamic';

interface ArticlePageProps {
  params: Promise<{
    slug: string;
  }>;
}

/**
 * 記事詳細ページの動的なメタデータ生成
 */
export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  
  if (!article) {
    return {
      title: '記事が見つかりません',
    };
  }

  return {
    title: article.title,
    description: article.excerpt, // 記事の要約を description に設定
    alternates: {
      canonical: `/articles/${slug}`,
    },
  };
}


// サーバー → クライアントへ渡すためのシリアライズ可能なコメントの型
export interface SerializableComment extends Omit<Comment, 'createdAt'> {
  createdAt: string; // Timestampを文字列に変換
}


export default async function ArticlePage({ params }: ArticlePageProps) {
  // Next.js 15: params は Promise なので await が必要
  const { slug } = await params;

  // 記事データとユーザー情報とサイト設定を並行取得
  const [article, user, settings] = await Promise.all([
    getArticleBySlug(slug),
    getUser(),
    getSiteSettings(),
  ]);

  // 記事が存在しない場合は 404
  if (!article) {
    notFound();
  }

  // 記事に紐づくコメントを取得
  const comments = await getCommentsForArticle(article.id, 100); // 100件に制限

  // 【修正】クライアントコンポーネントに渡す前にTimestampをシリアライズ可能な文字列に変換
  const serializableComments: SerializableComment[] = comments.map(comment => ({
    ...comment,
    createdAt: comment.createdAt.toDate().toISOString(),
  }));


  // アクセス権のチェック
  const canAccess =
    article.access === 'free' ||
    user.role === 'paid_member' ||
    user.role === 'admin';

  return (
    <div className="page-section--large">
      <div className="container--narrow">
        {canAccess ? (
          <>
            {/* 記事本文 */}
            <ArticleDisplay article={article} />
            
            {/* セパレータ */}
            <hr className="separator" />
            
            {/* コメントセクション */}
            <CommentSection 
              articleId={article.id}
              comments={serializableComments} 
              user={user}
              siteName={settings?.siteName || 'homepage'}
              termsOfServiceContent={settings?.termsOfServiceContent || ''}
            />
          </>
        ) : (
          /* ペイウォール */
          <Paywall />
        )}
      </div>
    </div>
  );
}
