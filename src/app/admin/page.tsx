/**
 * 管理者ダッシュボードページ
 * 
 * @description
 * 管理機能のトップページ。サイトの概要や主要な機能へのリンクを提供します。
 */
import { Settings, Newspaper, Wand2 } from 'lucide-react';
import Link from 'next/link';

export default function AdminDashboardPage() {
  return (
    <>
      <header className="admin-page-header">
        <h1>管理者ダッシュボード</h1>
        <p>
          左のメニューからサイトのコンテンツや設定を管理します。
        </p>
      </header>

      <div className="admin-card">
        <h2>クイックリンク</h2>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <Link href="/admin/settings" className="admin-btn">
            <Settings size={16} /> サイト設定
          </Link>
          <Link href="/admin/articles" className="admin-btn">
            <Newspaper size={16} /> 記事管理
          </Link>
          <Link href="/admin/articles/new" className="admin-btn admin-btn--primary">
            <Wand2 size={16} /> 新しい記事を作成
          </Link>
        </div>
      </div>
    </>
  );
}
