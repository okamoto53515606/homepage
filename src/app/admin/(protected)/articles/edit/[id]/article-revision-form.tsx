/**
 * AI記事修正フォーム（クライアントコンポーネント）
 * 
 * @description
 * AIに記事の修正を依頼するためのフォーム。
 * API Route を呼び出し、修正依頼を送信します。
 */
'use client';

import { useEffect, useState, useRef } from 'react';
import { fetchWithSigning } from '@/lib/fetch';
import { Loader2, Wand2 } from 'lucide-react';
import ProcessingModal from '@/components/admin/processing-modal';

interface ArticleRevisionFormProps {
  article: {
    id: string;
    [key: string]: unknown;
  };
}

/**
 * 送信ボタン
 */
function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <>
      {pending && <ProcessingModal />}
      <button type="submit" disabled={pending} className="admin-btn admin-btn--primary admin-btn--full">
        {pending ? (
          <>
            <Loader2 size={16} className="loading-spin" />
            <span>AIで修正中...</span>
          </>
        ) : (
          <>
            <Wand2 size={16} />
            <span>AIで修正を実行</span>
          </>
        )}
      </button>
    </>
  );
}

export default function ArticleRevisionForm({ article }: ArticleRevisionFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setNotification(null);

    const formData = new FormData(e.currentTarget);
    const body = {
      revisionRequest: formData.get('revisionRequest'),
    };

    try {
      const res = await fetchWithSigning(`/api/admin/articles/${article.id}/revise`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.status === 'error') {
        setNotification({ type: 'error', message: data.message });
      } else {
        setNotification({ type: 'success', message: data.message || 'AIによる修正が完了しました。' });
        formRef.current?.reset();
        window.location.reload();
        return;
      }
    } catch {
      // CloudFront の 504 タイムアウトを含むネットワークエラー。
      // Lambda は動き続けているため修正は正常に保存される。
      setNotification({
        type: 'error',
        message: 'AI処理に時間がかかっています。\n\n修正の保存は完了している可能性が高いため、しばらくしてからページを更新して確認してください。',
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} ref={formRef}>
      {notification && (
        <div 
          className={`admin-notice admin-notice--${notification.type}`}
          style={{ marginBottom: '1rem' }}
        >
          <p>{notification.message}</p>
        </div>
      )}

      <div className="admin-form-group">
        <label htmlFor="revisionRequest">AIへの修正依頼</label>
        <textarea
          id="revisionRequest"
          name="revisionRequest"
          className="admin-textarea"
          rows={4}
          placeholder="例：もっと専門的な言葉を使って、読者のレベルを少し高く設定してください。"
          required
        />
        <small>現在の記事内容に対して、どのように修正してほしいか具体的に指示します。</small>
      </div>
      
      <SubmitButton pending={pending} />
    </form>
  );
}
