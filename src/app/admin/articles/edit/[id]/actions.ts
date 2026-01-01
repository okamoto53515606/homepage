/**
 * 記事編集ページのサーバーアクション
 * 
 * @description
 * 編集フォームから送信されたデータでFirestoreのドキュメントを更新します。
 */
'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getUser } from '@/lib/auth';

// フォームのバリデーションスキーマ
const UpdateArticleSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です'),
  slug: z.string().min(1, 'スラッグは必須です'),
  content: z.string().min(1, '本文は必須です'),
  status: z.enum(['draft', 'published']),
  access: z.enum(['free', 'paid']),
  tags: z.string().transform(val => val.split(',').map(tag => tag.trim()).filter(Boolean)),
});

// フォームの状態を表す型
export interface FormState {
  status: 'idle' | 'success' | 'error';
  message: string;
}

/**
 * 記事を更新するサーバーアクション
 * @param articleId - 更新対象の記事ドキュメントID
 * @param prevState - 以前のフォーム状態
 * @param formData - フォームデータ
 * @returns 新しいフォーム状態
 */
export async function handleUpdateArticle(
  articleId: string,
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getUser();
  if (user.role !== 'admin') {
    return { status: 'error', message: '管理者権限がありません。' };
  }
  
  const validatedFields = UpdateArticleSchema.safeParse({
    title: formData.get('title'),
    slug: formData.get('slug'),
    content: formData.get('content'),
    status: formData.get('status'),
    access: formData.get('access'),
    tags: formData.get('tags'),
  });

  // バリデーション失敗
  if (!validatedFields.success) {
    const errorMessages = validatedFields.error.issues.map(issue => issue.message).join('\n');
    return { status: 'error', message: `入力エラー: ${errorMessages}` };
  }

  try {
    const db = getAdminDb();
    const articleRef = db.collection('articles').doc(articleId);

    // slugのユニーク制約チェック（自分自身を除く）
    const slugSnapshot = await db.collection('articles').where('slug', '==', validatedFields.data.slug).get();
    if (!slugSnapshot.empty && slugSnapshot.docs.some(doc => doc.id !== articleId)) {
        return { status: 'error', message: 'エラー: このスラッグは既に使用されています。' };
    }
    
    await articleRef.update({
      ...validatedFields.data,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // キャッシュの無効化
    revalidatePath(`/admin/articles/edit/${articleId}`); // 編集ページ
    revalidatePath('/admin/articles'); // 記事一覧ページ
    revalidatePath(`/articles/${validatedFields.data.slug}`); // 公開記事ページ

    console.log(`[Admin] 記事を更新しました: ${articleId}`);

    return { status: 'success', message: '記事が正常に更新されました。' };

  } catch (error) {
    console.error(`[Admin] 記事の更新に失敗 (ID: ${articleId}):`, error);
    const errorMessage = error instanceof Error ? error.message : '不明なサーバーエラーです。';
    return { status: 'error', message: `サーバーエラー: ${errorMessage}` };
  }
}
