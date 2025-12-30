/**
 * ヘッダーコンポーネント
 * 
 * サイト全体で共通のヘッダーを提供します。
 * - サイト名（ホームへのリンク）
 * - ユーザープロフィール（ログイン/ログアウト、ドロップダウンメニュー）
 * 
 * 【サーバーコンポーネント】
 * Headerはサーバーでレンダリングされ、ユーザー情報を取得します。
 * インタラクティブなUI部分はクライアントコンポーネント（UserProfileClient）に委譲します。
 */

import Link from 'next/link';
import { getUser, UserInfo } from '@/lib/auth';
import { UserProfileClient } from './header-client';

/**
 * ヘッダーメインコンポーネント（サーバーコンポーネント）
 * 
 * サーバーサイドでユーザー情報を取得し、クライアントコンポーネントに渡します。
 */
export default async function Header() {
  // サーバーサイドでユーザー情報を取得
  const user = await getUser();
  
  return (
    <header className="site-header">
      {/* サイト名 */}
      <Link href="/" className="site-header__title">
        Homepage
      </Link>

      {/* ユーザープロフィール（クライアントコンポーネント） */}
      <UserProfileClient user={user} />
    </header>
  );
}
