/**
 * 記事一覧ページ（管理画面）
 * 
 * @description
 * サイト内のすべての記事を一覧表示し、編集・削除・新規作成の操作を提供します。
 */
import Link from 'next/link';
import { Newspaper, PlusCircle } from 'lucide-react';

// ダミーデータ
const dummyArticles = [
  { id: '1', title: 'コンテンツ制作の未来', status: 'published', access: 'paid', updatedAt: '2024-05-20' },
  { id: '2', title: '透明性の高いオンラインコミュニティを構築する', status: 'published', access: 'free', updatedAt: '2024-05-19' },
  { id: '3', title: 'サイドハッスルの技術', status: 'draft', access: 'free', updatedAt: '2024-05-18' },
];

export default function ArticleListPage() {
  // TODO: Firestoreから記事データを取得する
  const articles = dummyArticles;

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
                  <td>{article.title}</td>
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
                  <td>{article.updatedAt}</td>
                  <td className="admin-table-actions">
                    <Link href={`/admin/articles/edit/${article.id}`} className="admin-btn">編集</Link>
                    <button className="admin-btn admin-btn--danger">削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}