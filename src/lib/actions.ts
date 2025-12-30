/**
 * Server Actions
 * 
 * サーバーサイドで実行されるアクションを定義します。
 * - 記事生成（AI）
 * 
 * 【注意】
 * 'use server' ディレクティブにより、
 * これらの関数はNext.jsによりAPIエンドポイントとして自動生成されます。
 * 
 * 【認証について】
 * 認証処理は /api/auth/session で行います。
 * Server Actions での直接的な認証操作は行いません。
 */

'use server';

import { generateArticleDraft } from '@/ai/flows/generate-article-draft';
import { z } from 'zod';

const ArticleSchema = z.object({
  contentGoal: z.string().min(10, { message: 'Content goal must be at least 10 characters.' }),
  context: z.string().min(10, { message: 'Context must be at least 10 characters.' }),
});

export type FormState = {
  message: string;
  markdownContent?: string;
  imageUrl?: string;
  fields?: Record<string, string>;
  issues?: string[];
};

export async function handleGenerateArticle(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validatedFields = ArticleSchema.safeParse({
    contentGoal: formData.get('contentGoal'),
    context: formData.get('context'),
  });

  if (!validatedFields.success) {
    const issues = validatedFields.error.issues.map((issue) => issue.message);
    return {
      message: 'Validation Error',
      issues,
      fields: {
        contentGoal: formData.get('contentGoal')?.toString() ?? '',
        context: formData.get('context')?.toString() ?? '',
      }
    };
  }
  
  try {
    const result = await generateArticleDraft(validatedFields.data);
    return {
      message: 'Success!',
      markdownContent: result.markdownContent,
      imageUrl: result.imageUrl,
    };
  } catch (error) {
    console.error(error);
    return {
      ...prevState,
      message: 'An error occurred while generating the article.',
    };
  }
}

