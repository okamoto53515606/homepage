/**
 * 記事生成ページ（管理者専用）
 * 
 * @description
 * AIを使用して記事の下書きを生成する管理者向けツール。
 * admin ロールを持つユーザーのみアクセス可能。
 */

import { getUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ArticleGeneratorForm from '@/components/article-generator-form';
import { Terminal } from 'lucide-react';

export default async function GenerateArticlePage() {
  // 認証チェック：admin ロール以外はトップページにリダイレクト
  const user = await getUser();

  if (user.role !== 'admin') {
    redirect('/');
  }

  return (
    <div className="admin-page">
      {/* ページヘッダー */}
      <header className="admin-page__header">
        <h1>記事生成ツール</h1>
        <p>
          コンテンツの目標とコンテキストを定義し、AIに下書きを生成させます。
        </p>
        
        {/* 管理者権限の通知 */}
        <div className="admin-notice">
          <Terminal size={16} />
          <div>
            <p className="admin-notice__title">管理者アクセス</p>
            <p>
              あなたには管理者権限があるため、このページを閲覧できます。
            </p>
          </div>
        </div>
      </header>

      {/* 記事生成フォーム */}
      <ArticleGeneratorForm />
    </div>
  );
}
