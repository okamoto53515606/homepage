/**
 * 記事一覧ページ（管理画面）
 * 
 * @description
 * サイト内のすべての記事を一覧表示し、編集・削除・新規作成の操作を提供します。
 * Firestoreから記事データを取得して表示します。
 * 
 * 【サーバーコンポーネント】
 * 記事データはサーバーで取得し、HTMLとして配信されます。
 */
import Link from 'next/link';
import { PlusCircle } from 'lucide-react';
import { getAdminArticles } from '@/lib/data';
import DeleteButton from './delete-button';
import PaginationControls from '@/components/admin/pagination-controls';

/**
 * Firestoreのタイムスタンプを読みやすい形式に変換する
 */
function formatTimestamp(timestamp: any): string {
  if (!timestamp || !timestamp.toDate) {
    return '----/--/--';
  }
  return timestamp.toDate().toLocaleDateString('ja-JP');
}

export default async function ArticleListPage({
  searchParams,
}: {
  // Next.js 15: searchParams は Promise 型
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Next.js 15: searchParams は Promise なので await が必要
  const resolvedSearchParams = await searchParams;
  const page = Number(resolvedSearchParams?.page || 1);
  const { items: articles, hasMore } = await getAdminArticles(page);

  return (
    <>
      <header className="admin-page-header">
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <div>
            <h1>記事管理</h1>
            <p>記事の作成、編集、削除を行います。</p>
          </div>
          <Link href="/admin/articles/new" className="admin-btn admin-btn--primary">
            <PlusCircle size={16} />
            <span>新規作成</span>
          </Link>
        </div>
      </header>

      <div className="admin-card">
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>タイトル</th>
                <th>ステータス</th>
                <th>アクセス</th>
                <th>最終更新日</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((article) => (
                <tr key={article.id}>
                  <td>
                    <Link href={`/admin/articles/edit/${article.id}`} className="admin-link">
                      {article.title}
                    </Link>
                  </td>
                  <td>
                    <span className={`admin-badge admin-badge--${article.status}`}>
                      {article.status === 'published' ? '公開中' : '下書き'}
                    </span>
                  </td>
                  <td>
                    <span className={`admin-badge admin-badge--${article.access}`}>
                      {article.access === 'paid' ? '有料' : '無料'}
                    </span>
                  </td>
                  <td>{formatTimestamp(article.updatedAt)}</td>
                  <td className="admin-table-actions">
                    <DeleteButton articleId={article.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {articles.length === 0 && (
            <p style={{textAlign: 'center', padding: '2rem'}}>記事はまだありません。</p>
          )}
        </div>
        
        {/* ページネーション */}
        <PaginationControls
          currentPage={page}
          hasMore={hasMore}
          basePath="/admin/articles"
        />
      </div>
    </>
  );
}
