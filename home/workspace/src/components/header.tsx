/**
 * ヘッダーコンポーネント
 * 
 * サイト全体で共通のヘッダーを提供します。
 * - サイト名（ホームへのリンク）
 * - ユーザープロフィール（ログイン/ログアウト、ドロップダウンメニュー）
 * 
 * 【サーバーコンポーネント】
 * Headerはサーバーでレンダリングされ、ユーザー情報とサイト設定を取得します。
 * インタラクティブなUI部分はクライアントコンポーネント（UserProfileClient）に委譲します。
 */

import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { getSiteSettings } from '@/lib/settings';
import { UserProfileClient } from './header-client';

export default async function Header() {
  // サーバーサイドでユーザー情報とサイト設定を取得
  const [user, settings] = await Promise.all([
    getUser(),
    getSiteSettings()
  ]);
  
  return (
    <header className="site-header">
      {/* サイト名 */}
      <Link href="/" className="site-header__title">
        {settings?.siteName || 'Homepage'}
      </Link>

      {/* ユーザープロフィール（クライアントコンポーネント） */}
      <UserProfileClient user={user} />
    </header>
  );
}
