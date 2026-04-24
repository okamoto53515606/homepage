/**
 * 記事更新 API
 * 
 * PUT /api/admin/articles/[id] - 記事のステータス・アクセスレベル更新
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAdminUser } from '@/lib/admin-auth';
import { logger } from '@/lib/env';
import { getDocClient, Tables } from '@/lib/dynamodb';
import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { invalidateCloudFrontCache } from '@/lib/cloudfront';

const UpdateArticleSchema = z.object({
  status: z.enum(['draft', 'published']),
  access: z.enum(['free', 'paid']),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminUser = await getAdminUser();
  if (!adminUser.isAuthenticated) {
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
    const docClient = getDocClient();

    await docClient.send(new UpdateCommand({
      TableName: Tables.articles,
      Key: { id: articleId },
      UpdateExpression: 'SET #status = :status, access = :access, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': validatedFields.data.status,
        ':access': validatedFields.data.access,
        ':now': new Date().toISOString(),
      },
    }));

    // slug を取得してrevalidate
    const articleResult = await docClient.send(new GetCommand({
      TableName: Tables.articles,
      Key: { id: articleId },
      ProjectionExpression: 'slug',
    }));
    const articleSlug = articleResult.Item?.slug;

    revalidatePath(`/admin/articles/edit/${articleId}`);
    revalidatePath('/admin/articles');
    if (articleSlug) {
      revalidatePath(`/articles/${articleSlug}`);
      await invalidateCloudFrontCache([`/articles/${articleSlug}`, '/', '/tags/*']);
    } else {
      await invalidateCloudFrontCache(['/', '/tags/*']);
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
