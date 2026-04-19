/**
 * 記事管理 API
 * 
 * DELETE /api/admin/articles
 * 
 * 管理者が記事を削除します。
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/auth';
import { logger } from '@/lib/env';
import { getDocClient, Tables } from '@/lib/dynamodb';
import { DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

export async function DELETE(request: NextRequest) {
  const user = await getUser();
  if (user.role !== 'admin') {
    return NextResponse.json(
      { status: 'error', message: '管理者権限がありません。' },
      { status: 403 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'リクエストボディが不正です。' },
      { status: 400 }
    );
  }

  const articleId = body.articleId as string;
  if (!articleId) {
    return NextResponse.json(
      { status: 'error', message: '記事IDが指定されていません。' },
      { status: 400 }
    );
  }

  try {
    const docClient = getDocClient();

    // 記事を削除
    await docClient.send(new DeleteCommand({
      TableName: Tables.articles,
      Key: { articleId },
    }));

    // 関連する article_tags を削除
    const tagResult = await docClient.send(new QueryCommand({
      TableName: Tables.articleTags,
      KeyConditionExpression: 'articleId = :aid',
      ExpressionAttributeValues: { ':aid': articleId },
    }));

    if (tagResult.Items && tagResult.Items.length > 0) {
      for (const item of tagResult.Items) {
        await docClient.send(new DeleteCommand({
          TableName: Tables.articleTags,
          Key: { articleId: item.articleId, tag: item.tag },
        }));
      }
    }

    logger.info(`[Admin] 記事を削除しました: ${articleId}`);
    revalidatePath('/admin/articles');

    return NextResponse.json({ status: 'success', message: '記事を削除しました。' });
  } catch (error) {
    logger.error(`[Admin] 記事の削除に失敗 (ID: ${articleId}):`, error);
    return NextResponse.json(
      { status: 'error', message: '記事の削除中にサーバーエラーが発生しました。' },
      { status: 500 }
    );
  }
}
