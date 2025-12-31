/**
 * 管理者ダッシュボードページ
 * 
 * @description
 * 管理機能のトップページ。
 * admin ロールを持つユーザーのみアクセス可能。
 */

import { getUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Terminal } from 'lucide-react';

export default async function AdminDashboardPage() {
  // 認証チェック：admin ロール以外はトップページにリダイレクト
  const user = await getUser();

  if (user.role !== 'admin') {
    redirect('/');
  }

  return (
    <div className="admin-page">
      {/* ページヘッダー */}
      <header className="admin-page__header">
        <h1>管理者ダッシュボード</h1>
        <p>
          このエリアは管理者専用です。サイトのコンテンツや設定を管理します。
        </p>
        
        {/* 管理者権限の通知 */}
        <div className="admin-notice">
          <Terminal size={16} />
          <div>
            <p className="admin-notice__title">管理者アクセス</p>
            <p>
              あなたは管理者権限を持っているため、このページを閲覧できます。
            </p>
          </div>
        </div>
      </header>

      {/* 今後のコンテンツエリア */}
      <div className="form-card">
        <p>ここに今後の管理機能が追加されていきます。</p>
      </div>
    </div>
  );
}
