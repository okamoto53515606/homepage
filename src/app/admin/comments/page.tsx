/**
 * コメント管理ページ（管理画面）
 * 
 * @description
 * サイト内のすべてのコメントを一覧表示し、削除の操作を提供します。
 * Firestoreからコメントデータを取得して表示します。
 * 
 * 【サーバーコンポーネント】
 * コメントデータはサーバーで取得し、HTMLとして配信されます。
 */
import { getAdminComments } from '@/lib/data';
import DeleteCommentButton from './delete-comment-button';
import Link from 'next/link';
import PaginationControls from '@/components/admin/pagination-controls';

/**
 * Firestoreのタイムスタンプを読みやすい形式に変換する
 */
function formatTimestamp(timestamp: any): string {
  if (!timestamp || !timestamp.toDate) {
    return '----/--/--';
  }
  return timestamp.toDate().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

export default async function CommentListPage({
  searchParams,
}: {
  // Next.js 15: searchParams は Promise 型
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Next.js 15: searchParams は Promise なので await が必要
  const resolvedSearchParams = await searchParams;
  const page = Number(resolvedSearchParams?.page || 1);
  const { items: comments, hasMore } = await getAdminComments(page);

  return (
    <>
      <header className="admin-page-header">
        <h1>コメント管理</h1>
        <p>サイトに投稿された全てのコメントを管理します。</p>
      </header>

      <div className="admin-card">
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>コメント内容</th>
                <th>投稿者情報</th>
                <th>対象記事</th>
                <th>投稿日時</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {comments.map((comment) => (
                <tr key={comment.id}>
                  <td style={{ minWidth: '200px', whiteSpace: 'pre-wrap' }}>{comment.content}</td>
                  <td>
                    <div>{comment.countryCode} / {comment.region}</div>
                    <div>ID: {comment.dailyHashId}</div>
                    <div style={{fontSize: '0.8rem', color: '#6c757d'}}>IP: {comment.ipAddress}</div>
                  </td>
                  <td>
                    {comment.articleSlug ? (
                      <Link 
                        href={`/articles/${comment.articleSlug}`}
                        className="admin-btn--inline"
                        title={comment.articleTitle}
                        style={{display: 'block', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}
                        target="_blank" // 新しいタブで開く
                        rel="noopener noreferrer"
                      >
                        {comment.articleTitle}
                      </Link>
                    ) : (
                      <span title="この記事は削除されたか、スラッグがありません">{comment.articleTitle}</span>
                    )}
                  </td>
                  <td>{formatTimestamp(comment.createdAt)}</td>
                  <td className="admin-table-actions">
                    <DeleteCommentButton commentId={comment.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {comments.length === 0 && (
            <p style={{textAlign: 'center', padding: '2rem'}}>コメントはまだありません。</p>
          )}
        </div>

        {/* ページネーション */}
        <PaginationControls
          currentPage={page}
          hasMore={hasMore}
          basePath="/admin/comments"
        />
      </div>
    </>
  );
}
