/**
 * 記事編集フォーム（クライアントコンポーネント）
 * 
 * @description
 * 記事の各項目を編集し、サーバーアクションを呼び出して更新します。
 */
'use client';

import { useFormState, useFormStatus } from 'react-dom';
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
        '記事を更新'
      )}
    </button>
  );
}

export default function ArticleEditForm({ initialArticle }: { initialArticle: ArticleData }) {
  const initialState: FormState = { status: 'idle', message: '' };
  
  // useFormState に記事IDを渡すため、actionをラップする
  const updateArticleWithId = handleUpdateArticle.bind(null, initialArticle.id);
  const [state, formAction] = useFormState(updateArticleWithId, initialState);

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

      {/* 基本情報 */}
      <div className="admin-form-group">
        <label htmlFor="title">タイトル</label>
        <input 
          type="text" 
          id="title" 
          name="title" 
          className="admin-input" 
          defaultValue={initialArticle.title}
          required 
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
          required 
        />
        <small>記事のURLになります。例: /articles/{initialArticle.slug}</small>
      </div>
      
      {/* 公開・アクセス設定 */}
      <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem' }}>
        <div className="admin-form-group">
          <label>ステータス</label>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="radio" name="status" value="draft" defaultChecked={initialArticle.status === 'draft'} />
              下書き
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="radio" name="status" value="published" defaultChecked={initialArticle.status === 'published'} />
              公開
            </label>
          </div>
        </div>
        <div className="admin-form-group">
          <label>アクセス</label>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="radio" name="access" value="free" defaultChecked={initialArticle.access === 'free'} />
              無料
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="radio" name="access" value="paid" defaultChecked={initialArticle.access === 'paid'} />
              有料
            </label>
          </div>
        </div>
      </div>
      
      {/* タグ */}
      <div className="admin-form-group">
        <label htmlFor="tags">タグ (カンマ区切り)</label>
        <input 
          type="text" 
          id="tags" 
          name="tags" 
          className="admin-input" 
          defaultValue={initialArticle.tags.join(', ')} 
        />
        <small>関連キーワードをカンマで区切って入力します。</small>
      </div>

      {/* 本文 */}
      <div className="admin-form-group">
        <label htmlFor="content">本文 (Markdown)</label>
        <textarea 
          id="content" 
          name="content" 
          className="admin-textarea" 
          rows={20}
          defaultValue={initialArticle.content}
          required
        />
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SubmitButton />
        <Link href="/admin/articles" className="admin-btn admin-btn--secondary">
          一覧に戻る
        </Link>
      </div>
    </form>
  );
}
