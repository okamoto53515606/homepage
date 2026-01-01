/**
 * 記事の公開ステータス更新フォーム（クライアントコンポーネント）
 * 
 * @description
 * 記事のステータス（公開/下書き）とアクセスレベル（無料/有料）を更新します。
 */
'use client';

import { useActionState, useFormStatus } from 'react';
import { useEffect, useState } from 'react';
import { handleUpdateArticle, type FormState } from './actions';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

// 記事の型定義
interface ArticleData {
  id: string;
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
        '公開ステータスを更新'
      )}
    </button>
  );
}

export default function ArticleEditForm({ article }: { article: ArticleData }) {
  const initialState: FormState = { status: 'idle', message: '' };
  
  // useActionState に記事IDを渡すため、actionをラップする
  const updateArticleWithId = handleUpdateArticle.bind(null, article.id);
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

      {/* --- 読み取り専用の値をサーバーアクションに渡すための隠しフィールド --- */}
      <input type="hidden" name="title" defaultValue={article.title} />
      <input type="hidden" name="slug" defaultValue={article.slug} />
      <input type="hidden" name="content" defaultValue={article.content} />
      <input type="hidden" name="tags" defaultValue={article.tags.join(', ')} />
      
      {/* --- Editable Fields (Status & Access) --- */}
      <div className="admin-form-group">
        <label>ステータス</label>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="radio" name="status" value="draft" defaultChecked={article.status === 'draft'} />
            下書き
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="radio" name="status" value="published" defaultChecked={article.status === 'published'} />
            公開
          </label>
        </div>
      </div>
      <div className="admin-form-group">
        <label>アクセス</label>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="radio" name="access" value="free" defaultChecked={article.access === 'free'} />
            無料
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="radio" name="access" value="paid" defaultChecked={article.access === 'paid'} />
            有料
          </label>
        </div>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
        <SubmitButton />
        <Link href="/admin/articles" className="admin-btn admin-btn--secondary">
          一覧へ
        </Link>
      </div>

    </form>
  );
}
