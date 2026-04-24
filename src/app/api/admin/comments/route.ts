/**
 * コメント削除 API
 *
 * DELETE /api/admin/comments?id=<commentId>
 *
 * 管理者がコメントを削除します。
 *
 * 【なぜ body ではなく URL クエリで ID を受けるか】
 * CloudFront OAC + Lambda Function URL の経路では、body 付き DELETE の
 * SHA256 ハッシュがクライアントと OAC 署名で一致しないケースが発生するため、
 * 空 body で済ませられる形に寄せて不整合を避ける。
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAdminUser } from '@/lib/admin-auth';
import { logger } from '@/lib/env';
import { getDocClient, Tables } from '@/lib/dynamodb';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';

export async function DELETE(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser.isAuthenticated) {
    return NextResponse.json(
      { status: 'error', message: '管理者権限がありません。' },
      { status: 403 }
    );
  }

  const commentId = request.nextUrl.searchParams.get('id') || '';
  const articleId = request.nextUrl.searchParams.get('articleId') || '';
  if (!commentId || !articleId) {
    return NextResponse.json(
      { status: 'error', message: 'コメントIDまたは記事IDが指定されていません。' },
      { status: 400 }
    );
  }

  try {
    // why: comments テーブルの主キーは (articleId=PK, commentId=SK) のコンポジットキー。
    //      commentId 単独では ValidationException になるため両方指定する。
    await getDocClient().send(new DeleteCommand({
      TableName: Tables.comments,
      Key: { articleId, commentId },
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
