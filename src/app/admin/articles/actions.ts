/**
 * 記事一覧ページのサーバーアクション
 * 
 * @description
 * 記事の削除処理などを行います。
 */
'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/auth';

/**
 * 記事を削除するサーバーアクション
 * @param formData - フォームデータ（articleIdを含む）
 */
export async function handleDeleteArticle(formData: FormData) {
  const user = await getUser();
  if (user.role !== 'admin') {
    throw new Error('管理者権限がありません。');
  }

  const articleId = formData.get('articleId') as string;
  if (!articleId) {
    throw new Error('記事IDが指定されていません。');
  }

  try {
    const db = getAdminDb();
    await db.collection('articles').doc(articleId).delete();

    console.log(`[Admin] 記事を削除しました: ${articleId}`);

    // 記事一覧ページのキャッシュをクリアして再生成
    revalidatePath('/admin/articles');
  } catch (error) {
    console.error(`[Admin] 記事の削除に失敗 (ID: ${articleId}):`, error);
    throw new Error('記事の削除中にサーバーエラーが発生しました。');
  }
}
