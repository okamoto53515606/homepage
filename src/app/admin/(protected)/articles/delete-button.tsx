/**
 * 記事削除ボタン（クライアントコンポーネント）
 * 
 * @description
 * 削除前に確認ダイアログを表示するインタラクティブなボタン。
 * API Route を呼び出して記事を削除します。
 */
'use client';

import { fetchWithSigning } from '@/lib/fetch';
import { Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';

export default function DeleteButton({ articleId }: { articleId: string }) {
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!confirm('この記事を本当に削除しますか？この操作は元に戻せません。')) {
      return;
    }

    setPending(true);
    try {
      const res = await fetchWithSigning(`/api/admin/articles?id=${encodeURIComponent(articleId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.status === 'error') {
        alert(`エラー: ${data.message}`);
      } else {
        window.location.reload();
      }
    } catch {
      alert('エラー: 記事の削除中にエラーが発生しました。');
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      className="admin-btn admin-btn--danger"
      disabled={pending}
      style={{ display: 'inline' }}
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
