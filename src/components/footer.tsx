/**
 * フッターコンポーネント
 * 
 * サイト全体で共通のフッターを提供します。
 * - コピーライト
 * - 法務関連ページへのリンク
 */
import { getSiteSettings } from '@/lib/settings';
import Link from 'next/link';

export default async function Footer() {
  const settings = await getSiteSettings();
  const year = new Date().getFullYear();
  const copyrightText = settings?.copyright || `© ${year} homepage. All Rights Reserved.`;

  return (
    <footer className="site-footer">
      <div className="footer-links">
        <Link href="/legal/terms">利用規約</Link>
        <Link href="/legal/privacy">プライバシーポリシー</Link>
        <Link href="/legal/commerce">特定商取引法に基づく表記</Link>
      </div>
      <p>{copyrightText}</p>
      {/* 
        <style jsx> はクライアントコンポーネントでしか使えないため、
        globals.css にスタイルを移動しました。
      */}
    </footer>
  );
}
