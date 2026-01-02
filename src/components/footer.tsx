/**
 * フッターコンポーネント
 * 
 * サイト全体で共通のフッターを提供します。
 * - コピーライト
 */
import { getSiteSettings } from '@/lib/settings';

export default async function Footer() {
  const settings = await getSiteSettings();
  const year = new Date().getFullYear();
  const copyrightText = settings?.copyright || `© ${year} homepage. All Rights Reserved.`;

  return (
    <footer className="site-footer">
      <p>{copyrightText}</p>
    </footer>
  );
}
