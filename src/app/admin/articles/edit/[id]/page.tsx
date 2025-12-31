/**
 * 記事編集ページ（管理画面）
 * 
 * @description
 * 既存の記事を編集するためのページ。
 */
import { getAdminDb } from '@/lib/firebase-admin';
import { notFound } from 'next/navigation';

interface ArticleEditPageProps {
  params: {
    id: string;
  };
}

// 記事の型定義（仮）
interface ArticleData {
  title: string;
  [key: string]: any;
}


async function getArticle(id: string): Promise<ArticleData | null> {
  const db = getAdminDb();
  const articleRef = db.collection('articles').doc(id);
  const doc = await articleRef.get();
  
  if (!doc.exists) {
    return null;
  }
  
  return doc.data() as ArticleData;
}


export default async function ArticleEditPage({ params }: ArticleEditPageProps) {
  const article = await getArticle(params.id);

  if (!article) {
    notFound();
  }

  return (
    <>
      <header className="admin-page-header">
        <h1>記事編集</h1>
        <p>記事ID: {params.id}</p>
      </header>
      
      <div className="admin-card">
        <h2>{article.title}</h2>
        <p>ここに記事編集フォームが実装されます。</p>
        {/* 
          - タイトル
          - スラッグ
          - コンテンツ (Markdownエディタ)
          - ステータス (公開/下書き)
          - アクセス (無料/有料)
          - タグ
          - 画像アセット管理
          - AI再生成ボタン
        */}
      </div>
    </>
  );
}
