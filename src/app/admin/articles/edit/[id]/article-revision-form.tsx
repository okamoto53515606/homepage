/**
 * AI記事修正フォーム（クライアントコンポーネント）
 * 
 * @description
 * AIに記事の修正を依頼するためのフォーム。
 * サーバーアクションを呼び出し、修正依頼を送信します。
 */
'use client';

import { useActionState, useFormStatus } from 'react-dom';
import { useEffect, useState, useRef } from 'react';
import { handleReviseArticle, type FormState } from './actions';
import { Loader2, Wand2 } from 'lucide-react';

interface ArticleRevisionFormProps {
  article: {
    id: string;
    [key: string]: any;
  };
}

/**
 * 送信ボタン
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
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
  );
}

export default function ArticleRevisionForm({ article }: ArticleRevisionFormProps) {
  const initialState: FormState = { status: 'idle', message: '' };
  const [state, formAction] = useActionState(handleReviseArticle, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (state.status === 'success') {
      setNotification({ type: 'success', message: state.message });
      formRef.current?.reset(); // 成功したらフォームをリセット
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
    if (state.status === 'error') {
      setNotification({ type: 'error', message: state.message });
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  return (
    <form action={formAction} ref={formRef}>
      {notification && (
        <div 
          className={`admin-notice admin-notice--${notification.type}`}
          style={{ marginBottom: '1rem' }}
        >
          <p>{notification.message}</p>
        </div>
      )}

      {/* 記事IDを隠しフィールドとして渡す */}
      <input type="hidden" name="articleId" value={article.id} />

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
      
      <SubmitButton />
    </form>
  );
}
