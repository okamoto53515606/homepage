/**
 * 管理画面共通レイアウト
 * 
 * @description
 * 全ての管理画面ページ（/admin以下のページ）に適用される共通レイアウト。
 * - 管理者認証（非管理者はリダイレクト）
 * - 専用CSSの読み込み
 * - 開閉可能なサイドナビゲーションメニュー
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import './admin.css';

export const metadata: Metadata = {
  title: 'サイト管理',
  description: '管理画面',
  // 管理画面が検索エンジンにインデックスされないように設定
  robots: {
    index: false,
    follow: false,
  },
};

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
      <AdminSidebar />
      <main className="admin-main">
        {children}
      </main>
    </div>
  );
}
