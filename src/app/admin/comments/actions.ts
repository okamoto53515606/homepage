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
import { logger } from '@/lib/env';

/**
 * コメントを削除するサーバーアクション
 * @param prevState - 以前のフォーム状態（useActionStateで使用）
 * @param formData - フォームデータ
 */
export async function handleDeleteComment(
  prevState: { status: string; message: string }, 
  formData: FormData
) {
  const user = await getUser();
  if (user.role !== 'admin') {
    return { status: 'error', message: '管理者権限がありません。' };
  }

  const commentId = formData.get('commentId') as string;
  if (!commentId) {
    return { status: 'error', message: 'コメントIDが指定されていません。' };
  }

  try {
    const db = getAdminDb();
    await db.collection('comments').doc(commentId).delete();

    logger.info(`[Admin] コメントを削除しました: ${commentId}`);

    // コメント管理ページのキャッシュをクリアして再生成
    revalidatePath('/admin/comments');

    return { status: 'success', message: 'コメントを削除しました。' };
  } catch (error) {
    logger.error(`[Admin] コメントの削除に失敗 (ID: ${commentId}):`, error);
    return { status: 'error', message: 'コメントの削除中にサーバーエラーが発生しました。' };
  }
}