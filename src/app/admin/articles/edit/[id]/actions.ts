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
  // title, slug, content, tags はAIが管理するため、ユーザーからの更新対象外とする
  // ただし、フォームに存在するため値は受け取る
  title: z.string(),
  slug: z.string(),
  content: z.string(),
  tags: z.string(),
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
    // 読み取り専用のフィールドもバリデーションのために含める
    title: formData.get('title'),
    slug: formData.get('slug'),
    content: formData.get('content'),
    tags: formData.get('tags'),
    // ユーザーが編集可能なフィールド
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

    // キャッシュの無効化
    revalidatePath(`/admin/articles/edit/${articleId}`); // 編集ページ
    revalidatePath('/admin/articles'); // 記事一覧ページ
    revalidatePath(`/articles/${validatedFields.data.slug}`); // 公開記事ページ

    console.log(`[Admin] 記事のステータス/アクセスを更新しました: ${articleId}`);

    return { status: 'success', message: '公開ステータスが正常に更新されました。' };

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
    // 【追加】現在の記事から画像URLのリストを取得
    const imageUrls = (currentArticle.imageAssets || []).map((asset: { url: string }) => asset.url);

    console.log(`[AI] 記事修正を開始 (ID: ${articleId})`);

    const revisedDraft = await reviseArticleDraft({
      currentTitle: currentArticle.title,
      currentContent: currentArticle.content,
      revisionRequest: revisionRequest,
      imageUrls: imageUrls, // 【追加】AIに画像URLリストを渡す
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

    return { status: 'success', message: 'AIによる記事の修正が完了しました。ページが自動的に更新されます。' };

  } catch (error) {
    console.error(`[Admin] AIによる記事修正に失敗 (ID: ${articleId}):`, error);
    const errorMessage = error instanceof Error ? error.message : '不明なサーバーエラーです。';
    return { status: 'error', message: `サーバーエラー: ${errorMessage}` };
  }
}
