/**
 * コメントセクションコンポーネント
 * 
 * 記事に対するコメントの一覧と投稿フォームを表示します。
 * ログイン状態に応じてフォームの表示を切り替えます。
 */
'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import type { Comment } from '@/lib/data';
import type { UserInfo } from '@/lib/auth';
import { useAuth } from '@/components/auth/auth-provider';
import { handleAddComment } from '@/app/articles/[slug]/actions';
import { Loader2 } from 'lucide-react';

/**
 * タイムスタンプを読みやすい形式にフォーマットする
 */
function formatTimestamp(timestamp: any): string {
    if (!timestamp || !timestamp.toDate) {
      // サーバーアクション直後は Date オブジェクトの場合がある
      if (timestamp instanceof Date) {
        return timestamp.toLocaleString('ja-JP');
      }
      return '投稿中...';
    }
    return timestamp.toDate().toLocaleString('ja-JP');
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
  /** 表示するコメント一覧 */
  comments: Comment[];
  /** 現在の記事ID */
  articleId: string;
  /** 現在のユーザー情報 */
  user: UserInfo;
}

export default function CommentSection({ comments, articleId, user }: CommentSectionProps) {
  const { signIn } = useAuth(); // ログイン関数を取得
  const formRef = useRef<HTMLFormElement>(null);
  const initialState = { status: 'idle', message: '' };
  const [state, formAction] = useActionState(handleAddComment, initialState);

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
            <button onClick={signIn} className="btn" style={{marginTop: '16px'}}>
              ログインしてコメントする
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
