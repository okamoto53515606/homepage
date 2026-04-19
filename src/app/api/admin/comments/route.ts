/**
 * コメント削除 API
 * 
 * DELETE /api/admin/comments
 * 
 * 管理者がコメントを削除します。
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/auth';
import { logger } from '@/lib/env';
import { getDocClient, Tables } from '@/lib/dynamodb';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';

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

  const commentId = body.commentId as string;
  if (!commentId) {
    return NextResponse.json(
      { status: 'error', message: 'コメントIDが指定されていません。' },
      { status: 400 }
    );
  }

  try {
    await getDocClient().send(new DeleteCommand({
      TableName: Tables.comments,
      Key: { commentId },
    }));

    logger.info(`[Admin] コメントを削除しました: ${commentId}`);
    revalidatePath('/admin/comments');

    return NextResponse.json({ status: 'success', message: 'コメントを削除しました。' });
  } catch (error) {
    logger.error(`[Admin] コメントの削除に失敗 (ID: ${commentId}):`, error);
    return NextResponse.json(
      { status: 'error', message: 'コメントの削除中にサーバーエラーが発生しました。' },
      { status: 500 }
    );
  }
}
