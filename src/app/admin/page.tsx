/**
 * 管理者ダッシュボードページ
 * 
 * @description
 * 管理機能のトップページ。サイトの概要や主要な機能へのリンクを提供します。
 */
import { Terminal, Settings, Newspaper, Wand2 } from 'lucide-react';
import Link from 'next/link';

export default function AdminDashboardPage() {
  return (
    <>
      <header className="admin-page-header">
        <h1>管理者ダッシュボード</h1>
        <p>
          このエリアは管理者専用です。サイトのコンテンツや設定を管理します。
        </p>
      </header>

      <div className="admin-card">
        <h2>ようこそ！</h2>
        <p>左のメニューから各機能にアクセスしてください。</p>
        
        <div className="admin-notice">
          <Terminal size={16} />
          <div>
            <p className="admin-notice__title">管理者アクセス</p>
            <p>
              あなたは管理者権限を持っているため、このページを閲覧できています。
            </p>
          </div>
        </div>
      </div>
      
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