/**
 * フッターコンポーネント
 * 
 * サイト全体で共通のフッターを提供します。
 * - コピーライト
 */

export default function Footer() {
  return (
    <footer className="site-footer">
      <p>&copy; {new Date().getFullYear()} Homepage. All Rights Reserved.</p>
    </footer>
  );
}
