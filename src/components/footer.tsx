/**
 * フッターコンポーネント
 * 
 * サイト全体で共通のフッターを提供します。
 * - コピーライト
 */

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        {/* コピーライト */}
        <div className="site-footer__brand">
          <p>&copy; {new Date().getFullYear()} Homepage. All Rights Reserved.</p>
        </div>
      </div>
    </footer>
  );
}
