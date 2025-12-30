/**
 * Server Actions
 * 
 * サーバーサイドで実行されるアクションを定義します。
 * - 記事生成（AI）
 * - 認証関連（クッキー操作）
 * 
 * 【注意】
 * 'use server' ディレクティブにより、
 * これらの関数はNext.jsによりAPIエンドポイントとして自動生成されます。
 */

'use server';

import { generateArticleDraft } from '@/ai/flows/generate-article-draft';
import { z } from 'zod';
import { signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { cookies } from 'next/headers';

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

export async function signInWithGoogle() {
  // This function is intended to be called from a client component.
  // The server-side equivalent for session management would be more complex.
  // For this prototype, we'll handle login on the client.
}

export async function handleSignOut() {
  const cookieStore = await cookies();
  cookieStore.delete('user_role');
  // Further Firebase signout logic will be handled on the client
}

