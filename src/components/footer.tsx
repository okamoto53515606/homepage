/**
 * フッターコンポーネント
 * 
 * サイト全体で共通のフッターを提供します。
 * - コピーライト
 * - 法務関連ページへのリンク（2行構成）
 * - 退会リンク（ログイン済みユーザーのみ表示）
 */
import { getSiteSettings } from '@/lib/settings';
import { getUser } from '@/lib/auth';
import Link from 'next/link';

export default async function Footer() {
  const [settings, user] = await Promise.all([
    getSiteSettings(),
    getUser(),
  ]);
  const year = new Date().getFullYear();
  const copyrightText = settings?.copyright || `© ${year} homepage. All Rights Reserved.`;

  return (
    <footer className="site-footer">
      <div className="footer-links">
        <div className="footer-links-row">
          <Link href="/legal/terms">利用規約</Link>
          <Link href="/legal/privacy">プライバシーポリシー</Link>
        </div>
        <div className="footer-links-row">
          <Link href="/legal/commerce">特定商取引法に基づく表記</Link>
          {user.isLoggedIn && (
            <Link href="/withdraw">退会</Link>
          )}
        </div>
      </div>
      <p>{copyrightText}</p>
      {/* 
        <style jsx> はクライアントコンポーネントでしか使えないため、
        globals.css にスタイルを移動しました。
      */}
    </footer>
  );
}
