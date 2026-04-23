/**
 * コメント削除ボタン（クライアントコンポーネント）
 * 
 * @description
 * 削除前に確認ダイアログを表示するインタラクティブなボタン。
 * API Route を呼び出してコメントを削除します。
 */
'use client';

import { fetchWithSigning } from '@/lib/fetch';
import { Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';

export default function DeleteCommentButton({ commentId }: { commentId: string }) {
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!confirm('このコメントを本当に削除しますか？この操作は元に戻せません。')) {
      return;
    }

    setPending(true);
    try {
      const res = await fetchWithSigning(`/api/admin/comments?id=${encodeURIComponent(commentId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.status === 'error') {
        alert(`エラー: ${data.message}`);
      } else {
        window.location.reload();
      }
    } catch {
      alert('エラー: コメントの削除中にエラーが発生しました。');
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      className="admin-btn admin-btn--danger"
      disabled={pending}
      onClick={handleDelete}
    >
      {pending ? (
        <Loader2 size={16} className="loading-spin" />
      ) : (
        <Trash2 size={16} />
      )}
    </button>
  );
}
