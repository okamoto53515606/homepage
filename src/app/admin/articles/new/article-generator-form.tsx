/**
 * [クライアントコンポーネント] AI記事生成フォーム
 * 
 * @description
 * サーバーアクション `handleGenerateAndSaveDraft` を呼び出し、
 * フォームの送信状態を管理します。
 */
'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useEffect, useState } from 'react';
import { handleGenerateAndSaveDraft, type FormState } from './actions';
import { Loader2, Wand2 } from 'lucide-react';

/**
 * 送信ボタンコンポーネント
 * useFormStatus で送信状態を取得してローディング表示
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="admin-btn admin-btn--primary">
      {pending ? (
        <>
          <Loader2 size={16} className="loading-spin" />
          <span>生成して下書き保存...</span>
        </>
      ) : (
        <>
          <Wand2 size={16} />
          <span>生成して下書き保存</span>
        </>
      )}
    </button>
  );
}

export default function ArticleGeneratorForm() {
  const initialState: FormState = { status: 'idle', message: '' };
  const [state, formAction] = useFormState(handleGenerateAndSaveDraft, initialState);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  /**
   * フォーム送信結果に応じて通知を表示
   */
  useEffect(() => {
    if (state.status === 'error') {
      setNotification({ type: 'error', message: state.message + (state.issues ? `\n- ${state.issues.join('\n- ')}` : '') });
    }
  }, [state]);

  return (
    <>
      {/* 通知メッセージ */}
      {notification && (
        <div className={`admin-notice admin-notice--${notification.type}`} style={{marginBottom: '1rem'}}>
          <p>{notification.message}</p>
        </div>
      )}

      {/* 入力フォーム */}
      <form action={formAction}>
        <div className="admin-form-group">
          <label htmlFor="contentGoal" className="form-group__label">
            コンテンツの目標
          </label>
          <textarea
            id="contentGoal"
            name="contentGoal"
            placeholder="例：サーバーサイドレンダリングがSEOに与える利点を説明する。"
            rows={3}
            required
            defaultValue={state.fields?.contentGoal}
            className="admin-textarea"
          />
        </div>
        <div className="admin-form-group">
          <label htmlFor="context" className="form-group__label">
            コンテキスト
          </label>
          <textarea
            id="context"
            name="context"
            placeholder="例：ターゲット読者はジュニアウェブ開発者。SSRを使用する人気フレームワークとしてNext.jsに言及する。"
            rows={5}
            required
            defaultValue={state.fields?.context}
            className="admin-textarea"
          />
        </div>
        <SubmitButton />
      </form>
    </>
  );
}
