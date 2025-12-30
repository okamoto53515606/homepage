/**
 * フッターコンポーネント
 * 
 * サイト全体で共通のフッターを提供します。
 * - コピーライト
 * - キャッチコピー
 */

export default function Footer() {
  return (
    <footer className="site-footer">
      <div>
        {/* コピーライト */}
        <div className="site-footer__brand">
          <p>&copy; {new Date().getFullYear()} Homepage. All Rights Reserved.</p>
        </div>
        
        {/* キャッチコピー */}
        <div>
          現代のための思慮深いコンテンツ。
        </div>
      </div>
    </footer>
  );
}
