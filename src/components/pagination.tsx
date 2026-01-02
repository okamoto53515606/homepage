/**
 * ページネーションコンポーネント（利用者サイト用）
 * 
 * 【サーバーコンポーネント】
 * Linkのみを使用するため、クライアントJSは不要です。
 * サーバーでHTMLとして配信されます。
 */
import Link from 'next/link';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath: string;
}

export default function Pagination({ currentPage, totalPages, basePath }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <nav className="pagination">
      <ul className="pagination__list">
        {/* 前へ */}
        <li className="pagination__item">
          {currentPage > 1 ? (
            <Link href={`${basePath}?p=${currentPage - 1}`} className="pagination__link">
              前へ
            </Link>
          ) : (
            <span className="pagination__link disabled">前へ</span>
          )}
        </li>

        {/* ページ番号 */}
        {pages.map(page => (
          <li key={page} className="pagination__item">
            {page === currentPage ? (
              <span className="pagination__link active">{page}</span>
            ) : (
              <Link href={`${basePath}?p=${page}`} className="pagination__link">
                {page}
              </Link>
            )}
          </li>
        ))}

        {/* 次へ */}
        <li className="pagination__item">
          {currentPage < totalPages ? (
            <Link href={`${basePath}?p=${currentPage + 1}`} className="pagination__link">
              次へ
            </Link>
          ) : (
            <span className="pagination__link disabled">次へ</span>
          )}
        </li>
      </ul>
    </nav>
  );
}
