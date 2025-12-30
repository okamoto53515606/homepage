'use client';

/**
 * 記事生成フォームコンポーネント
 * 
 * @description
 * AI記事生成のためのフォーム。コンテンツ目標とコンテキストを入力し、
 * Genkit を使用して記事の下書きを生成する。
 */

import { useFormState, useFormStatus } from 'react-dom';
import { useEffect, useState } from 'react';
import { handleGenerateArticle, type FormState } from '@/lib/actions';
import { Loader2, Wand2, Clipboard, Image as ImageIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Image from 'next/image';

/**
 * 送信ボタンコンポーネント
 * useFormStatus で送信状態を取得してローディング表示
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn--with-icon">
      {pending ? (
        <>
          <Loader2 size={16} className="loading-spin" />
          <span>生成中...</span>
        </>
      ) : (
        <>
          <Wand2 size={16} />
          <span>記事を生成</span>
        </>
      )}
    </button>
  );
}

export default function ArticleGeneratorForm() {
  const initialState: FormState = { message: '' };
  const [state, formAction] = useFormState(handleGenerateArticle, initialState);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  /**
   * フォーム送信結果に応じて通知を表示
   */
  useEffect(() => {
    if (state.message === 'Success!') {
      setNotification({ type: 'success', message: '記事が正常に生成されました！' });
    } else if (state.message === 'Validation Error') {
      setNotification({ type: 'error', message: state.issues?.join('\n') || '入力内容を確認してください。' });
    } else if (state.message && state.message !== '') {
      setNotification({ type: 'error', message: state.message });
    }
  }, [state]);

  /**
   * マークダウンをクリップボードにコピー
   */
  const handleCopyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
    setNotification({ type: 'success', message: 'クリップボードにコピーしました' });
  };

  return (
    <>
      {/* 通知メッセージ */}
      {notification && (
        <div className={`notification notification--${notification.type}`}>
          <p>{notification.message}</p>
          <button 
            onClick={() => setNotification(null)} 
            aria-label="通知を閉じる"
          >
            ×
          </button>
        </div>
      )}

      {/* 入力フォーム */}
      <form action={formAction}>
        <div className="form-card">
          <div className="form-card__header">
            <h2>コンテンツプロンプト</h2>
            <p>
              生成したい記事の詳細を入力してください。
            </p>
          </div>
          <div>
            <div className="form-group">
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
                className="form-group__textarea"
              />
            </div>
            <div className="form-group">
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
                className="form-group__textarea"
              />
            </div>
            <SubmitButton />
          </div>
        </div>
      </form>

      {/* 生成結果表示 */}
      {state.markdownContent && (
        <div className="generated-result">
          <div className="generated-result__header">
            <div>
              <h2>生成された下書き</h2>
              <p>AIが生成した内容を確認・編集してください。</p>
            </div>
            <button 
              onClick={() => handleCopyToClipboard(state.markdownContent || '')}
              className="btn btn--with-icon"
            >
              <Clipboard size={16} />
              <span>マークダウンをコピー</span>
            </button>
          </div>
          <div>
            {/* 生成画像プレビュー */}
            {state.imageUrl && (
              <div className="generated-result__image-section">
                <h3 className="generated-result__image-title">
                  <ImageIcon size={20} />
                  <span>推奨画像</span>
                </h3>
                <div className="generated-result__image">
                  <Image src={state.imageUrl} alt="生成された画像" fill />
                </div>
              </div>
            )}
            
            {/* マークダウンプレビュー */}
            <div className="generated-result__preview">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {state.markdownContent}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
