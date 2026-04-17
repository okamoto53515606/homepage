/**
 * 記事更新・AI修正 API
 * 
 * PUT /api/admin/articles/[id] - 記事のステータス・アクセスレベル更新
 * POST /api/admin/articles/[id]/revise - AIによる記事修正
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { logger } from '@/lib/env';

const UpdateArticleSchema = z.object({
  status: z.enum(['draft', 'published']),
  access: z.enum(['free', 'paid']),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (user.role !== 'admin') {
    return NextResponse.json(
      { status: 'error', message: '管理者権限がありません。' },
      { status: 403 }
    );
  }

  const { id: articleId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'リクエストボディが不正です。' },
      { status: 400 }
    );
  }

  const validatedFields = UpdateArticleSchema.safeParse(body);

  if (!validatedFields.success) {
    const errorMessages = validatedFields.error.issues.map(issue => issue.message).join('\n');
    return NextResponse.json(
      { status: 'error', message: `入力エラー: ${errorMessages}` },
      { status: 400 }
    );
  }

  try {
    const db = getAdminDb();
    const articleRef = db.collection('articles').doc(articleId);

    await articleRef.update({
      status: validatedFields.data.status,
      access: validatedFields.data.access,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const articleDoc = await articleRef.get();
    const articleSlug = articleDoc.data()?.slug;

    revalidatePath(`/admin/articles/edit/${articleId}`);
    revalidatePath('/admin/articles');
    if (articleSlug) {
      revalidatePath(`/articles/${articleSlug}`);
    }

    logger.info(`[Admin] 記事のステータス/アクセスを更新しました: ${articleId}`);

    return NextResponse.json({
      status: 'success',
      message: '公開ステータスが正常に更新されました。',
    });
  } catch (error) {
    logger.error(`[Admin] 記事の更新に失敗 (ID: ${articleId}):`, error);
    const errorMessage = error instanceof Error ? error.message : '不明なサーバーエラーです。';
    return NextResponse.json(
      { status: 'error', message: `サーバーエラー: ${errorMessage}` },
      { status: 500 }
    );
  }
}
