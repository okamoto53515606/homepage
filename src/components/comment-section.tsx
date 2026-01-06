/**
 * コメントセクションコンポーネント
 * 
 * 記事に対するコメントの一覧と投稿フォームを表示します。
 * ログイン状態に応じてフォームの表示を切り替えます。
 */
'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { UserInfo } from '@/lib/auth';
import { useAuth } from '@/components/auth/auth-provider';
import { handleAddComment } from '@/app/articles/[slug]/actions';
import { Loader2 } from 'lucide-react';
import type { SerializableComment } from '@/app/articles/[slug]/page';
import { LoginModal } from './login-modal';


/**
 * タイムスタンプを読みやすい形式にフォーマットする
 * @param timestamp - サーバーから渡されるISO形式の文字列
 * @returns フォーマットされた日付文字列
 */
function formatTimestamp(timestamp: string | Date): string {
  // サーバーアクション直後は Date オブジェクト、DBからの読み込み時は文字列になるため両方に対応
  try {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    return date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  } catch (e) {
    return '日付不明';
  }
}

/**
 * フォームの送信状態に応じて表示を切り替えるボタン
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn">
      {pending ? (
        <>
          <Loader2 size={16} className="loading-spin" />
          <span>投稿中...</span>
        </>
      ) : (
        'コメントを投稿'
      )}
    </button>
  );
}

interface CommentSectionProps {
  /** 表示するコメント一覧 (シリアライズ済み) */
  comments: SerializableComment[];
  /** 現在の記事ID */
  articleId: string;
  /** 現在のユーザー情報 */
  user: UserInfo;
  /** サイト名 */
  siteName: string;
  /** 利用規約のコンテンツ */
  termsOfServiceContent: string;
}

export default function CommentSection({ comments, articleId, user, siteName, termsOfServiceContent }: CommentSectionProps) {
  const { signIn } = useAuth(); // ログイン関数を取得
  const formRef = useRef<HTMLFormElement>(null);
  const initialState = { status: 'idle', message: '' };
  const [state, formAction] = useActionState(handleAddComment, initialState);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // フォーム送信成功時にテキストエリアをクリア
  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <section>
      {/* ヘッダー */}
      <div>
        <h2>コメント ({comments.length})</h2>
      </div>

      {/* コメント一覧 */}
      <div className="comment-list">
        {comments.map((comment) => (
          <div key={comment.id} className="comment">
            <div className="comment__header">
              <span>{comment.countryCode} / {comment.region} / ID:{comment.dailyHashId}</span>
              <span>{formatTimestamp(comment.createdAt)}</span>
            </div>
            <p style={{ whiteSpace: 'pre-wrap' }}>{comment.content}</p>
          </div>
        ))}
      </div>

      {/* コメント投稿フォーム */}
      <div className="comment-form">
        {user.isLoggedIn ? (
          <form action={formAction} ref={formRef}>
            <input type="hidden" name="articleId" value={articleId} />
            <div className="form-group">
              <label htmlFor="commentContent" className="form-group__label">
                コメントを投稿
              </label>
              <textarea
                id="commentContent"
                name="content"
                className="form-group__textarea"
                rows={4}
                required
              />
            </div>
            <SubmitButton />
            {state.status === 'error' && <p className="error-text" style={{marginTop: '8px'}}>{state.message}</p>}
          </form>
        ) : (
          // 未ログイン時の表示
          <div className="form-card" style={{textAlign: 'center'}}>
            <p>コメントを投稿するにはログインが必要です。</p>
            <button onClick={() => setIsLoginModalOpen(true)} className="btn" style={{marginTop: '16px'}}>
              ログインしてコメントする
            </button>
            <LoginModal
              isOpen={isLoginModalOpen}
              onClose={() => setIsLoginModalOpen(false)}
              siteName={siteName}
              termsOfServiceContent={termsOfServiceContent}
            />
          </div>
        )}
      </div>
    </section>
  );
}
