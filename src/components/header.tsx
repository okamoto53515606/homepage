/**
 * ヘッダーコンポーネント
 * 
 * サイト全体で共通のヘッダーを提供します。
 * - 左: ハンバーガーメニュー（サイト内リンク）
 * - 中央: 有料会員の有効期限
 * - 右: ユーザープロフィール（ログイン/ログアウト）
 * 
 * 【サーバーコンポーネント】
 * タグとサイト設定をサーバーで取得します。
 * ユーザー情報はCDN対応のためクライアントで /api/auth/me から取得します。
 */

import { getTags } from '@/lib/data';
import { getSiteSettings } from '@/lib/settings';
import { HeaderUserSection } from './header-client';
import HamburgerMenu from './hamburger-menu';

export default async function Header() {
  // サーバーサイドでタグ情報とサイト設定を並行取得（cookies不使用 = CDNキャッシュ可能）
  const [tags, settings] = await Promise.all([
    getTags(20),
    getSiteSettings(),
  ]);
  
  return (
    <header className="site-header">
      <div className="header__left">
        <HamburgerMenu tags={tags} />
      </div>
      
      {/* ユーザー情報はクライアントで取得（CDN対応） */}
      <HeaderUserSection
        siteName={settings?.siteName || 'homepage'}
        termsOfServiceContent={settings?.termsOfServiceContent || ''}
      />
    </header>
  );
}
