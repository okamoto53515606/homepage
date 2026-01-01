/**
 * 記事編集フォーム（クライアントコンポーネント）
 * 
 * @description
 * 記事の各項目を編集し、サーバーアクションを呼び出して更新します。
 */
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useEffect, useState } from 'react';
import { handleUpdateArticle, type FormState } from './actions';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

// 記事の型定義
interface ArticleData {
  id: string;
  title: string;
  slug: string;
  content: string;
  tags: string[];
  status: 'published' | 'draft';
  access: 'free' | 'paid';
  imageAssets: { url: string; fileName: string; uploadedAt: string }[];
  [key: string]: any;
}

/**
 * 送信ボタン
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="admin-btn admin-btn--primary">
      {pending ? (
        <>
          <Loader2 size={16} className="loading-spin" />
          <span>更新中...</span>
        </>
      ) : (
        '公開ステータスを更新'
      )}
    </button>
  );
}

export default function ArticleEditForm({ initialArticle }: { initialArticle: ArticleData }) {
  const initialState: FormState = { status: 'idle', message: '' };
  
  // useActionState に記事IDを渡すため、actionをラップする
  const updateArticleWithId = handleUpdateArticle.bind(null, initialArticle.id);
  const [state, formAction] = useActionState(updateArticleWithId, initialState);

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (state.status === 'success' || state.status === 'error') {
      setNotification({ type: state.status, message: state.message });
      // 3秒後に通知を消す
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  return (
    <form action={formAction}>
      {notification && (
        <div 
          className={`admin-notice admin-notice--${notification.type}`}
          style={{ marginBottom: '1.5rem' }}
        >
          <p>{notification.message}</p>
        </div>
      )}

      {/* --- Read-Only Fields --- */}
      <div className="admin-form-group">
        <label htmlFor="title">タイトル</label>
        <input 
          type="text" 
          id="title" 
          name="title" 
          className="admin-input" 
          defaultValue={initialArticle.title}
          readOnly 
        />
      </div>

      <div className="admin-form-group">
        <label htmlFor="slug">スラッグ (URL)</label>
        <input 
          type="text" 
          id="slug" 
          name="slug" 
          className="admin-input" 
          defaultValue={initialArticle.slug}
          readOnly
        />
      </div>
      
      <div className="admin-form-group">
        <label htmlFor="tags">タグ (カンマ区切り)</label>
        <input 
          type="text" 
          id="tags" 
          name="tags" 
          className="admin-input" 
          defaultValue={initialArticle.tags.join(', ')} 
          readOnly
        />
      </div>

      {/* Hidden input for content for validation, if needed */}
      <input type="hidden" name="content" defaultValue={initialArticle.content} />


      {/* --- Editable Fields (Status & Access) --- */}
      <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', border: '1px solid #dee2e6', padding: '1rem', borderRadius: '8px' }}>
        <div className="admin-form-group">
          <label>ステータス</label>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="radio" name="status" value="draft" defaultChecked={initialArticle.status === 'draft'} />
              下書き
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="radio" name="status" value="published" defaultChecked={initialArticle.status === 'published'} />
              公開
            </label>
          </div>
        </div>
        <div className="admin-form-group">
          <label>アクセス</label>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="radio" name="access" value="free" defaultChecked={initialArticle.access === 'free'} />
              無料
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="radio" name="access" value="paid" defaultChecked={initialArticle.access === 'paid'} />
              有料
            </label>
          </div>
        </div>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SubmitButton />
        <Link href="/admin/articles" className="admin-btn admin-btn--secondary">
          一覧に戻る
        </Link>
      </div>

      {/* --- Uploaded Image Assets --- */}
      {initialArticle.imageAssets && initialArticle.imageAssets.length > 0 && (
        <div style={{marginTop: '2rem'}}>
          <h3 style={{fontSize: '1.1rem', marginBottom: '1rem'}}>アップロード済み画像アセット</h3>
          <div className="admin-image-preview-grid">
            {initialArticle.imageAssets.map((image, index) => (
              <div key={index} className="admin-image-preview">
                <img src={image.url} alt={image.fileName || `Image ${index + 1}`} />
                <div className="admin-image-preview__overlay">{image.fileName}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .admin-image-preview-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
          gap: 1rem;
        }
        .admin-image-preview {
          position: relative;
          aspect-ratio: 1 / 1;
          border-radius: 6px;
          overflow: hidden;
        }
        .admin-image-preview img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .admin-image-preview__overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: rgba(0,0,0,0.6);
          color: white;
          font-size: 0.75rem;
          padding: 4px;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </form>
  );
}
