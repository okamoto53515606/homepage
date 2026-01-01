/**
 * 新規記事作成ページのサーバーアクション
 * 
 * @description
 * 1. AI記事生成フローを呼び出す
 * 2. 生成された内容をFirestoreのarticlesコレクションに下書きとして保存
 * 3. 成功した場合、新しく作成された記事の編集ページにリダイレクト
 */
'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { generateArticleDraft } from '@/ai/flows/generate-article-draft';
import { getAdminDb } from '@/lib/firebase-admin';
import { getUser } from '@/lib/auth';
import { FieldValue } from 'firebase-admin/firestore';

// フォームのバリデーションスキーマ
const ArticleSchema = z.object({
  contentGoal: z.string().min(10, { message: 'コンテンツの目標は10文字以上で入力してください。' }),
  context: z.string().min(10, { message: 'コンテキストは10文字以上で入力してください。' }),
  access: z.enum(['free', 'paid'], { message: 'アクセスレベルを選択してください。'}),
  imageUrls: z.string().optional(),
});

// フォームの状態を表す型
export type FormState = {
  status: 'idle' | 'success' | 'error' | 'generating';
  message: string;
  fields?: Record<string, string>;
  issues?: string[];
};

/**
 * 既存の全タグをFirestoreから取得する
 */
async function getExistingTags(): Promise<string[]> {
  try {
    const db = getAdminDb();
    const articlesSnapshot = await db.collection('articles').select('tags').get();
    const allTags = articlesSnapshot.docs.flatMap(doc => doc.data().tags || []);
    const uniqueTags = [...new Set(allTags)];
    console.log(`[Tags] 取得した既存のユニークタグ: ${uniqueTags.length}件`);
    return uniqueTags;
  } catch (error) {
    console.error('[Tags] 既存タグの取得に失敗:', error);
    return []; // エラーが発生した場合は空の配列を返す
  }
}

/**
 * 記事を生成し、下書きとして保存するサーバーアクション
 */
export async function handleGenerateAndSaveDraft(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getUser();
  if (user.role !== 'admin') {
    return { status: 'error', message: '管理者権限がありません。' };
  }

  const validatedFields = ArticleSchema.safeParse({
    contentGoal: formData.get('contentGoal'),
    context: formData.get('context'),
    access: formData.get('access'),
    imageUrls: formData.get('imageUrls'),
  });

  // バリデーション失敗
  if (!validatedFields.success) {
    const issues = validatedFields.error.issues.map((issue) => issue.message);
    return {
      status: 'error',
      message: '入力内容を確認してください。',
      issues: issues,
      fields: {
        contentGoal: formData.get('contentGoal')?.toString() ?? '',
        context: formData.get('context')?.toString() ?? '',
        access: formData.get('access')?.toString() ?? 'free',
        imageUrls: formData.get('imageUrls')?.toString() ?? '',
      }
    };
  }
  
  let newArticleId: string;
  try {
    // 1. AIで記事下書きを生成
    console.log('[AI] 記事下書きの生成を開始...');
    const imageUrls = validatedFields.data.imageUrls?.split(',').filter(url => url) || [];
    
    //【追加】既存タグリストを取得
    const existingTags = await getExistingTags();

    const draft = await generateArticleDraft({
      contentGoal: validatedFields.data.contentGoal,
      context: validatedFields.data.context,
      isPaidContent: validatedFields.data.access === 'paid',
      imageUrls: imageUrls,
      existingTags: existingTags, //【追加】AIに既存タグを渡す
    });
    console.log('[AI] 記事下書きの生成が完了しました。');

    // 2. Firestoreに下書きとして保存
    const db = getAdminDb();
    const articlesRef = db.collection('articles');
    
    const slug = (draft.title || `draft-${Date.now()}`)
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    const imageAssets = imageUrls.map(url => ({
      url: url,
      // FieldValue.serverTimestamp() は配列内で使用できないため、
      // サーバーアクション実行時の現在時刻を使用する
      uploadedAt: new Date(),
    }));

    const newArticleData = {
      title: draft.title || '無題の記事',
      content: draft.markdownContent,
      excerpt: draft.excerpt,
      teaserContent: draft.teaserContent,
      tags: draft.tags || [],
      
      generationPrompt: {
        goal: validatedFields.data.contentGoal,
        context: validatedFields.data.context,
      },
      
      slug,
      status: 'draft',
      access: validatedFields.data.access,
      imageAssets: imageAssets,
      authorId: user.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const newArticleRef = await articlesRef.add(newArticleData);
    newArticleId = newArticleRef.id;
    console.log(`[DB] 新規記事(下書き)を作成しました: ${newArticleId}`);

  } catch (error) {
    console.error('[Action Error] 記事の生成または保存に失敗:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 'error',
      message: `記事の生成または保存中にサーバーエラーが発生しました。\n${errorMessage}`,
      fields: validatedFields.data,
    };
  }

  redirect(`/admin/articles/edit/${newArticleId}`);
}
