/**
 * ページネーションコンポーネント（利用者サイト用）
 * 
 * 【サーバーコンポーネント】
 * カーソルベースのページネーション。「次へ」リンクのみ表示。
 */
import Link from 'next/link';

interface PaginationProps {
  basePath: string;
  nextCursor?: string;
  hasPrevious?: boolean;
}

export default function Pagination({ basePath, nextCursor, hasPrevious }: PaginationProps) {
  if (!nextCursor && !hasPrevious) {
    return null;
  }

  return (
    <nav className="pagination">
      <ul className="pagination__list">
        {/* トップへ戻る（カーソル付きページの場合） */}
        {hasPrevious && (
          <li className="pagination__item">
            <Link href={basePath} className="pagination__link">
              最初へ
            </Link>
          </li>
        )}

        {/* 次へ */}
        {nextCursor ? (
          <li className="pagination__item">
            <Link href={`${basePath}?cursor=${nextCursor}`} className="pagination__link">
              次へ
            </Link>
          </li>
        ) : (
          <li className="pagination__item">
            <span className="pagination__link disabled">次へ</span>
          </li>
        )}
      </ul>
    </nav>
  );
}
