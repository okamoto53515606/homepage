/**
 * ルートレイアウト
 * 
 * アプリケーション全体のレイアウトを定義します。
 * - HTML の基本構造
 * - 認証プロバイダー
 * - ヘッダー・フッター
 * - GTM (Google Tag Manager) スニペット
 * 
 * 注意: /admin 以下のパスでは、このレイアウトの子要素として
 * /admin/layout.tsx が挿入され、管理画面専用のレイアウトを構築します。
 */

import type { Metadata } from 'next';
import { GoogleTagManager } from '@next/third-parties/google';
import './globals.css';
import Header from '@/components/header';
import Footer from '@/components/footer';
import { AuthProvider } from '@/components/auth/auth-provider';
import { getSiteSettings } from '@/lib/settings';

/**
 * デフォルトのメタデータ（フォールバック値）
 * 
 * トップページでは page.tsx の generateMetadata が優先され、
 * settings コレクションの metaTitle / metaDescription が使用されます。
 * ここで定義する値は、他のページでメタデータが設定されていない場合の
 * フォールバックとして機能します。
 */
export const metadata: Metadata = {
  title: '',
  description: '',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // サイト設定を取得
  const settings = await getSiteSettings();
  const gtmId = settings?.gtmId || '';

  return (
    <html lang="ja">
      {gtmId && <GoogleTagManager gtmId={gtmId} />}
      <head />
      <body>
        <AuthProvider>
          <Header />
          <main>{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}