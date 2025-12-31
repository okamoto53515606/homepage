/**
 * 管理画面共通レイアウト
 * 
 * @description
 * 全ての管理画面ページ（/admin以下のページ）に適用される共通レイアウト。
 * - 管理者認証（非管理者はリダイレクト）
 * - 専用CSSの読み込み
 * - サイドナビゲーションメニュー
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { Settings, Newspaper, Home } from 'lucide-react';
import './admin.css';

export const metadata: Metadata = {
  title: 'サイト管理',
  description: 'homepageの管理画面',
};

/**
 * 管理画面のサイドナビゲーション
 */
function AdminNav() {
  // TODO: 現在のパスに基づいてアクティブなリンクをハイライトする
  const navItems = [
    { href: '/admin', label: 'ダッシュボード', icon: Settings },
    { href: '/admin/settings', label: 'サイト設定', icon: Settings },
    { href: '/admin/articles', label: '記事管理', icon: Newspaper },
  ];

  return (
    <nav className="admin-nav">
      <ul>
        {navItems.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="admin-nav__link">
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <hr className="admin-nav__separator" />
      <Link href="/" className="admin-nav__link admin-nav__link--back">
        <Home size={20} />
        <span>サイトを表示</span>
      </Link>
    </nav>
  );
}

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 認証チェック：admin ロール以外はトップページにリダイレクト
  const user = await getUser();
  if (user.role !== 'admin') {
    redirect('/');
  }

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__header">
          <h2>サイト管理</h2>
        </div>
        <AdminNav />
      </aside>
      <main className="admin-main">
        {children}
      </main>
    </div>
  );
}