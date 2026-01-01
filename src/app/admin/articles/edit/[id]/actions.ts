/**
 * 記事編集ページのサーバーアクション
 * 
 * @description
 * 編集フォームから送信されたデータでFirestoreのドキュメントを更新します。
 * AIによる記事修正依頼も処理します。
 */
'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { reviseArticleDraft } from '@/ai/flows/revise-article-draft'; // AI修正フローをインポート

// 手動更新用のバリデーションスキーマ
const UpdateArticleSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です'),
  slug: z.string().min(1, 'スラッグは必須です'),
  content: z.string().min(1, '本文は必須です'),
  status: z.enum(['draft', 'published']),
  access: z.enum(['free', 'paid']),
  tags: z.string().transform(val => val.split(',').map(tag => tag.trim()).filter(Boolean)),
});

// AI修正用のバリデーションスキーマ
const ReviseArticleSchema = z.object({
  revisionRequest: z.string().min(5, '修正依頼は5文字以上で入力してください。'),
  articleId: z.string(),
});


// フォームの状態を表す型
export interface FormState {
  status: 'idle' | 'success' | 'error';
  message: string;
}

/**
 * 記事を手動で更新するサーバーアクション
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


/**
 * AIで記事を修正するサーバーアクション
 * @param prevState - 以前のフォーム状態
 * @param formData - フォームデータ
 * @returns 新しいフォーム状態
 */
export async function handleReviseArticle(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getUser();
  if (user.role !== 'admin') {
    return { status: 'error', message: '管理者権限がありません。' };
  }

  const validatedFields = ReviseArticleSchema.safeParse({
    revisionRequest: formData.get('revisionRequest'),
    articleId: formData.get('articleId'),
  });

  if (!validatedFields.success) {
    return { status: 'error', message: '入力内容が正しくありません。' };
  }

  const { articleId, revisionRequest } = validatedFields.data;

  try {
    const db = getAdminDb();
    const articleRef = db.collection('articles').doc(articleId);
    const doc = await articleRef.get();

    if (!doc.exists) {
      return { status: 'error', message: '対象の記事が見つかりません。' };
    }

    const currentArticle = doc.data()!;

    console.log(`[AI] 記事修正を開始 (ID: ${articleId})`);

    const revisedDraft = await reviseArticleDraft({
      currentTitle: currentArticle.title,
      currentContent: currentArticle.content,
      revisionRequest: revisionRequest,
    });

    console.log(`[AI] 記事修正が完了 (ID: ${articleId})`);

    // AIの修正内容でFirestoreドキュメントを更新
    await articleRef.update({
      title: revisedDraft.revisedTitle,
      content: revisedDraft.revisedContent,
      excerpt: revisedDraft.revisedExcerpt,
      teaserContent: revisedDraft.revisedTeaserContent,
      tags: revisedDraft.revisedTags,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // キャッシュを無効化
    revalidatePath(`/admin/articles/edit/${articleId}`);

    return { status: 'success', message: 'AIによる記事の修正が完了しました。' };

  } catch (error) {
    console.error(`[Admin] AIによる記事修正に失敗 (ID: ${articleId}):`, error);
    const errorMessage = error instanceof Error ? error.message : '不明なサーバーエラーです。';
    return { status: 'error', message: `サーバーエラー: ${errorMessage}` };
  }
}
