/**
 * ヘッダーコンポーネント
 * 
 * サイト全体で共通のヘッダーを提供します。
 * - 左: ハンバーガーメニュー（サイト内リンク）
 * - 中央: 有料会員の有効期限
 * - 右: ユーザープロフィール（ログイン/ログアウト）
 * 
 * 【サーバーコンポーネント】
 * ユーザー情報とサイト設定を取得し、UI要素を配置します。
 * インタラクティブな部分はクライアントコンポーネントに委譲します。
 */

import { getUser } from '@/lib/auth';
import { getTags } from '@/lib/data';
import { UserProfileClient } from './header-client';
import HamburgerMenu from './hamburger-menu';

/**
 * サーバーでユーザーの有効期限を描画
 */
function UserStatus({ user }: { user: Awaited<ReturnType<typeof getUser>> }) {
  // 有料会員（管理者含む）で、有効期限がある場合のみ表示
  if (user.accessExpiry && new Date(user.accessExpiry) > new Date()) {
    const expiryDate = new Date(user.accessExpiry).toLocaleDateString('ja-JP');
    return (
      <div className="header__center">
        <span className="header__expiry-label">有料会員期限</span>
        <span className="header__expiry-date">{expiryDate}</span>
      </div>
    );
  }
  return <div className="header__center"></div>; // 中央寄せを維持するための空div
}

export default async function Header() {
  // サーバーサイドでユーザー情報とタグ情報を並行取得
  const [user, tags] = await Promise.all([
    getUser(),
    getTags(20) // 上位20件のタグを取得
  ]);
  
  return (
    <header className="site-header">
      <div className="header__left">
        <HamburgerMenu tags={tags} />
      </div>
      
      <UserStatus user={user} />

      <div className="header__right">
        <UserProfileClient user={user} />
      </div>
    </header>
  );
}
