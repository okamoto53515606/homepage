/**
 * 記事の公開ステータス更新フォーム（クライアントコンポーネント）
 * 
 * @description
 * 記事のステータス（公開/下書き）とアクセスレベル（無料/有料）を更新します。
 */
'use client';

import { useEffect, useState } from 'react';
import { fetchWithSigning } from '@/lib/fetch';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

// 記事の型定義
interface ArticleData {
  id: string;
  status: 'published' | 'draft';
  access: 'free' | 'paid';
  slug: string; // 読み取り専用だが、再検証のために必要
  [key: string]: any;
}

/**
 * 送信ボタン
 */
function SubmitButton({ pending }: { pending: boolean }) {
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
  const [pending, setPending] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setNotification(null);

    const formData = new FormData(e.currentTarget);
    const body = {
      status: formData.get('status'),
      access: formData.get('access'),
    };

    try {
      const res = await fetchWithSigning(`/api/admin/articles/${article.id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setNotification({ type: data.status === 'success' ? 'success' : 'error', message: data.message });
    } catch {
      setNotification({ type: 'error', message: 'サーバーエラーが発生しました。' });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {notification && (
        <div 
          className={`admin-notice admin-notice--${notification.type}`}
          style={{ marginBottom: '1.5rem' }}
        >
          <p>{notification.message}</p>
        </div>
      )}

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
        <SubmitButton pending={pending} />
        <Link href="/admin/articles" className="admin-btn admin-btn--secondary">
          一覧へ
        </Link>
      </div>

    </form>
  );
}
