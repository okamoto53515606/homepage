/**
 * 記事編集ページ（管理画面）
 * 
 * @description
 * 既存の記事を編集するためのページ。
 * サーバーで記事データを取得し、クライアントコンポーネントのフォームに渡します。
 * AIによる記事修正機能も提供します。
 */
import { getAdminDb } from '@/lib/firebase-admin';
import { notFound } from 'next/navigation';
import ArticleEditForm from './article-edit-form';
import ArticleRevisionForm from './article-revision-form'; // AI修正フォームをインポート
import ReactMarkdown from 'react-markdown'; // プレビュー用にインポート
import remarkGfm from 'remark-gfm'; // プレビュー用にインポート
import type { Timestamp } from 'firebase-admin/firestore';

// 記事の完全な型定義
interface ArticleData {
  id: string;
  title: string;
  slug: string;
  content: string;
  tags: string[];
  status: 'published' | 'draft';
  access: 'free' | 'paid';
  // 他のフィールドも必要に応じて追加
  [key:string]: any;
}


/**
 * IDを指定して記事データを1件取得する（下書き含む）
 * @param id - 記事ドキュメントID
 * @returns 記事データ、または null
 */
async function getArticle(id: string): Promise<ArticleData | null> {
  try {
    const db = getAdminDb();
    const articleRef = db.collection('articles').doc(id);
    const doc = await articleRef.get();
    
    if (!doc.exists) {
      return null;
    }
    
    const data = doc.data()!;
    
    // imageAssets配列内のTimestampを文字列に変換
    const imageAssets = (data.imageAssets || []).map((asset: { url: string; uploadedAt: Timestamp }) => ({
        ...asset,
        uploadedAt: asset.uploadedAt?.toDate?.().toISOString() || null,
    }));

    // Firestore の Timestamp を JSON でシリアライズ可能な文字列に変換
    const serializableData = {
      ...data,
      imageAssets, // 変換済みの配列で上書き
      createdAt: data.createdAt?.toDate?.().toISOString() || null,
      updatedAt: data.updatedAt?.toDate?.().toISOString() || null,
    };
    
    return {
      id: doc.id,
      ...serializableData
    } as ArticleData;

  } catch (error) {
    console.error(`[Admin] 記事の取得に失敗しました (ID: ${id}):`, error);
    return null;
  }
}


export default async function ArticleEditPage({ params }: { params: { id: string } }) {
  const article = await getArticle(params.id);

  if (!article) {
    notFound();
  }

  return (
    <>
      <header className="admin-page-header">
        <h1>記事編集</h1>
        <p>AIが生成した下書きを確認・編集し、公開設定を行います。</p>
      </header>
      
      {/* 2カラムレイアウト */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>

        {/* 左カラム: 編集フォーム */}
        <div className="admin-card">
          <ArticleEditForm initialArticle={article} />
        </div>
        
        {/* 右カラム: プレビューとAI修正 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* AI修正依頼フォーム */}
          <div className="admin-card">
            <h2 style={{fontSize: '1.25rem', marginBottom: '1rem'}}>AIによる記事修正</h2>
            <ArticleRevisionForm article={article} />
          </div>

          {/* 記事プレビュー */}
          <div className="admin-card">
            <h2 style={{fontSize: '1.25rem', marginBottom: '1rem'}}>記事プレビュー</h2>
            <div className="prose" style={{maxHeight: '600px', overflowY: 'auto', paddingRight: '1rem'}}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {article.content}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
      <style jsx>{`
        .prose {
          line-height: 1.7;
        }
        .prose :global(h1),
        .prose :global(h2),
        .prose :global(h3) {
          margin-top: 1.5em;
          margin-bottom: 0.5em;
          font-weight: 600;
        }
        .prose :global(p) {
          margin-bottom: 1em;
        }
        .prose :global(ul),
        .prose :global(ol) {
          margin-left: 1.5rem;
          margin-bottom: 1em;
        }
        .prose :global(img) {
          max-width: 100%;
          border-radius: 8px;
        }
      `}</style>
    </>
  );
}
