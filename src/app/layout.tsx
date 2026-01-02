/**
 * ルートレイアウト
 * 
 * アプリケーション全体のレイアウトを定義します。
 * - HTML の基本構造
 * - 認証プロバイダー
 * - ヘッダー・フッター
 * 
 * 注意: 管理画面では /admin/layout.tsx が優先されます。
 * このレイアウトは利用者サイトにのみ適用されます。
 */

import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/header';
import Footer from '@/components/footer';
import { AuthProvider } from '@/components/auth/auth-provider';

/**
 * デフォルトのメタデータ（フォールバック値）
 * 
 * トップページでは page.tsx の generateMetadata が優先され、
 * settings コレクションの metaTitle / metaDescription が使用されます。
 * ここで定義する値は、他のページでメタデータが設定されていない場合の
 * フォールバックとして機能します。
 */
export const metadata: Metadata = {
  title: 'Homepage',
  description: '思慮深いコンテンツのための新しいホームページ。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 管理画面のパスではこのレイアウトを描画しない
  if (children && (children as React.ReactElement).props?.childProp?.segment === 'admin') {
    return (
      <html lang="ja" suppressHydrationWarning>
        <body>
          <AuthProvider>
            {children}
          </AuthProvider>
        </body>
      </html>
    );
  }

  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        {/* システムフォント使用のためGoogle Fontsは不要 */}
      </head>
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