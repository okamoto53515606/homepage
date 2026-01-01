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
import ArticleRevisionForm from './article-revision-form';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Timestamp } from 'firebase-admin/firestore';
import Link from 'next/link';

// 記事の完全な型定義
interface ArticleData {
  id: string;
  title: string;
  slug: string;
  content: string;
  tags: string[];
  status: 'published' | 'draft';
  access: 'free' | 'paid';
  imageAssets: { url: string; fileName: string; uploadedAt: string }[];
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
    const imageAssets = (data.imageAssets || []).map((asset: { url: string; fileName: string; uploadedAt: Timestamp }) => ({
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

      {/* --- Read-Only Info --- */}
      <div className="admin-card" style={{marginBottom: '2rem'}}>
        <div className="admin-article-info">
          <h2>{article.title}</h2>
          <p className="admin-article-info__slug">
            記事のパス：<strong>/articles/{article.slug}</strong>
            {article.status === 'published' && (
                <Link href={`/articles/${article.slug}`} target="_blank" className="admin-btn--inline">
                  公開ページを表示
                </Link>
            )}
          </p>
          
          <div className="admin-article-info__tags">
            {article.tags.map(tag => <span key={tag} className="admin-badge">{tag}</span>)}
          </div>
          
          {article.imageAssets && article.imageAssets.length > 0 && (
            <div className="admin-article-info__assets">
              <div className="admin-thumbnail-grid">
                {article.imageAssets.map((image, index) => (
                  <a href={image.url} key={index} target="_blank" rel="noopener noreferrer" className="admin-thumbnail">
                    <img src={image.url} alt={image.fileName || `Image ${index + 1}`} />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* 記事プレビュー */}
      <div className="admin-card" style={{marginBottom: '2rem'}}>
        <h2 style={{fontSize: '1.25rem', marginBottom: '1rem'}}>記事プレビュー</h2>
        <div className="admin-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {article.content}
          </ReactMarkdown>
        </div>
      </div>
      
      {/* 記事をみたうえで変更する項目をプレビューの下に配置 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div className="admin-card">
           <h2 style={{fontSize: '1.25rem', marginBottom: '1rem'}}>公開設定</h2>
          <ArticleEditForm article={article} />
        </div>
        
        <div className="admin-card">
          <h2 style={{fontSize: '1.25rem', marginBottom: '1rem'}}>AIによる記事修正</h2>
          <ArticleRevisionForm article={article} />
        </div>
      </div>
    </>
  );
}