/**
 * コメント削除ボタン（クライアントコンポーネント）
 * 
 * @description
 * 削除前に確認ダイアログを表示するインタラクティブなボタン。
 * サーバーアクションを呼び出してコメントを削除します。
 */
'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { handleDeleteComment } from './actions';
import { Loader2, Trash2 } from 'lucide-react';
import { useEffect } from 'react';

/**
 * フォームの送信状態に応じて表示を切り替えるボタン
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="admin-btn admin-btn--danger"
      disabled={pending}
      // 確認ダイアログをここに追加
      onClick={(e) => {
        if (!confirm('このコメントを本当に削除しますか？この操作は元に戻せません。')) {
          e.preventDefault();
        }
      }}
    >
      {pending ? (
          <Loader2 size={16} className="loading-spin" />
      ) : (
        <Trash2 size={16} />
      )}
    </button>
  );
}


export default function DeleteCommentButton({ commentId }: { commentId: string }) {
    const [state, formAction] = useFormState(handleDeleteComment, { status: 'idle', message: ''});

    useEffect(() => {
        if (state.status === 'error') {
            alert(state.message);
        }
    }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="commentId" value={commentId} />
      <SubmitButton />
    </form>
  );
}
