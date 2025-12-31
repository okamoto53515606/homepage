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
});

// フォームの状態を表す型
export type FormState = {
  status: 'idle' | 'success' | 'error' | 'generating';
  message: string;
  fields?: Record<string, string>;
  issues?: string[];
};

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
  });

  // バリデーション失敗
  if (!validatedFields.success) {
    const issues = validatedFields.error.issues.map((issue) => issue.message);
    console.log('Validation issues:', issues);
    return {
      status: 'error',
      message: '入力内容を確認してください。',
      issues: issues,
      fields: {
        contentGoal: formData.get('contentGoal')?.toString() ?? '',
        context: formData.get('context')?.toString() ?? '',
        access: formData.get('access')?.toString() ?? 'free',
      }
    };
  }
  
  let newArticleId: string;
  try {
    // 1. AIで記事下書きを生成
    console.log('[AI] 記事下書きの生成を開始...');
    const draft = await generateArticleDraft({
      contentGoal: validatedFields.data.contentGoal,
      context: validatedFields.data.context,
      // AIプロンプトに有料/無料のコンテキストを追加
      isPaidContent: validatedFields.data.access === 'paid',
    });
    console.log('[AI] 記事下書きの生成が完了しました。');

    // 2. Firestoreに下書きとして保存
    const db = getAdminDb();
    const articlesRef = db.collection('articles');
    
    // titleからslugを生成 (簡単な例)
    const slug = (draft.title || `draft-${Date.now()}`)
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const newArticleData = {
      // AIが生成したコンテンツ
      title: draft.title || '無題の記事',
      content: draft.markdownContent,
      excerpt: draft.excerpt,
      teaserContent: draft.teaserContent,
      tags: draft.tags || [],
      
      // 管理者が入力したプロンプト
      generationPrompt: {
        goal: validatedFields.data.contentGoal,
        context: validatedFields.data.context,
      },
      
      // デフォルト値 & システム値
      slug,
      status: 'draft',
      access: validatedFields.data.access, // フォームから設定
      imageAssets: [], // 画像は後から編集画面で追加
      authorId: user.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const newArticleRef = await articlesRef.add(newArticleData);
    newArticleId = newArticleRef.id;
    console.log(`[DB] 新規記事(下書き)を作成しました: ${newArticleId}`);

  } catch (error) {
    console.error('[Action Error] 記事の生成または保存に失敗:', error);
    return {
      status: 'error',
      message: '記事の生成または保存中にサーバーエラーが発生しました。',
      fields: validatedFields.data,
    };
  }

  // 3. 成功後、作成した記事の編集ページにリダイレクト
  redirect(`/admin/articles/edit/${newArticleId}`);
}
