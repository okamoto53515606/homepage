/**
 * 記事削除ボタン（クライアントコンポーネント）
 * 
 * @description
 * 削除前に確認ダイアログを表示するインタラクティブなボタン。
 * サーバーアクションを呼び出して記事を削除します。
 */
'use client';

import { useFormStatus } from 'react-dom';
import { handleDeleteArticle } from './actions';
import { Loader2, Trash2 } from 'lucide-react';

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
        if (!confirm('この記事を本当に削除しますか？この操作は元に戻せません。')) {
          e.preventDefault();
        }
      }}
    >
      {pending ? (
        <>
          <Loader2 size={16} className="loading-spin" />
          <span>削除中...</span>
        </>
      ) : (
        '削除'
      )}
    </button>
  );
}


export default function DeleteButton({ articleId }: { articleId: string }) {
  return (
    <form action={handleDeleteArticle}>
      <input type="hidden" name="articleId" value={articleId} />
      <SubmitButton />
    </form>
  );
}
