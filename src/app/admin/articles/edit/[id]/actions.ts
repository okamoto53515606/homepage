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
import { logger } from '@/lib/env';

// 手動更新用のバリデーションスキーマ
const UpdateArticleSchema = z.object({
  status: z.enum(['draft', 'published']),
  access: z.enum(['free', 'paid']),
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
 * 【追加】既存の全タグをFirestoreから取得する
 */
async function getExistingTags(): Promise<string[]> {
  try {
    const db = getAdminDb();
    const articlesSnapshot = await db.collection('articles').select('tags').get();
    const allTags = articlesSnapshot.docs.flatMap(doc => doc.data().tags || []);
    const uniqueTags = [...new Set(allTags)];
    logger.debug(`[Tags] 取得した既存のユニークタグ: ${uniqueTags.length}件`);
    return uniqueTags;
  } catch (error) {
    logger.error('[Tags] 既存タグの取得に失敗:', error);
    return []; // エラーが発生した場合は空の配列を返す
  }
}

/**
 * 記事のステータスとアクセスレベルを更新するサーバーアクション
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
    status: formData.get('status'),
    access: formData.get('access'),
  });

  // バリデーション失敗
  if (!validatedFields.success) {
    const errorMessages = validatedFields.error.issues.map(issue => issue.message).join('\n');
    return { status: 'error', message: `入力エラー: ${errorMessages}` };
  }

  try {
    const db = getAdminDb();
    const articleRef = db.collection('articles').doc(articleId);
    
    // 更新するデータは status と access のみ
    await articleRef.update({
      status: validatedFields.data.status,
      access: validatedFields.data.access,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const articleDoc = await articleRef.get();
    const articleSlug = articleDoc.data()?.slug;

    // キャッシュの無効化
    revalidatePath(`/admin/articles/edit/${articleId}`); // 編集ページ
    revalidatePath('/admin/articles'); // 記事一覧ページ
    if (articleSlug) {
        revalidatePath(`/articles/${articleSlug}`); // 公開記事ページ
    }

    logger.info(`[Admin] 記事のステータス/アクセスを更新しました: ${articleId}`);

    return { status: 'success', message: '公開ステータスが正常に更新されました。' };

  } catch (error) {
    logger.error(`[Admin] 記事の更新に失敗 (ID: ${articleId}):`, error);
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
    // 現在の記事から画像URLのリストを取得
    const imageUrls = (currentArticle.imageAssets || []).map((asset: { url: string }) => asset.url);
    //【追加】既存タグリストを取得
    const existingTags = await getExistingTags();

    logger.info(`[AI] 記事修正を開始 (ID: ${articleId})`);

    const revisedDraft = await reviseArticleDraft({
      currentTitle: currentArticle.title,
      currentContent: currentArticle.content,
      revisionRequest: revisionRequest,
      imageUrls: imageUrls, // AIに画像URLリストを渡す
      existingTags: existingTags, //【追加】AIに既存タグリストを渡す
    });

    logger.info(`[AI] 記事修正が完了 (ID: ${articleId})`);

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

    return { status: 'success', message: 'AIによる記事の修正が完了しました。ページが自動的に更新されます。' };

  } catch (error) {
    logger.error(`[Admin] AIによる記事修正に失敗 (ID: ${articleId}):`, error);
    const errorMessage = error instanceof Error ? error.message : '不明なサーバーエラーです。';
    return { status: 'error', message: `サーバーエラー: ${errorMessage}` };
  }
}
