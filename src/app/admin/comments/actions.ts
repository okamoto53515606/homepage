/**
 * コメント管理ページのサーバーアクション
 * 
 * @description
 * コメントの削除処理を行います。
 */
'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/auth';

/**
 * コメントを削除するサーバーアクション
 * @param formData - フォームデータ（commentIdを含む）
 */
export async function handleDeleteComment(formData: FormData) {
  const user = await getUser();
  if (user.role !== 'admin') {
    throw new Error('管理者権限がありません。');
  }

  const commentId = formData.get('commentId') as string;
  if (!commentId) {
    throw new Error('コメントIDが指定されていません。');
  }

  try {
    const db = getAdminDb();
    await db.collection('comments').doc(commentId).delete();

    console.log(`[Admin] コメントを削除しました: ${commentId}`);

    // コメント管理ページのキャッシュをクリアして再生成
    revalidatePath('/admin/comments');

    return { status: 'success', message: 'コメントを削除しました。' };
  } catch (error) {
    console.error(`[Admin] コメントの削除に失敗 (ID: ${commentId}):`, error);
    return { status: 'error', message: 'コメントの削除中にサーバーエラーが発生しました。' };
  }
}
