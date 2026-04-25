/**
 * 退会（アカウント削除）API
 * 
 * ユーザーの退会処理を行います。
 * 
 * 【処理内容】
 * 1. commentsのuserIdをnull化
 * 2. usersドキュメントを物理削除
 * 3. セッションクッキーを削除
 * 
 * 【エンドポイント】
 * DELETE /api/auth/withdraw - 退会処理
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUser } from '@/lib/auth';
import { getDocClient, Tables, Indexes } from '@/lib/dynamodb';
import { QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { logger } from '@/lib/env';

const SESSION_COOKIE_NAME = 'session';

/**
 * DELETE: 退会処理
 */
export async function DELETE() {
  try {
    const user = await getUser();

    if (user.role === 'guest') {
      return NextResponse.json(
        { error: 'ログインが必要です' },
        { status: 401 }
      );
    }

    const userId = user.uid;
    logger.info(`[Withdraw] 退会処理開始: userId=${userId}`);

    const docClient = getDocClient();

    // 1. commentsのuserIdをnull化（GSI comments-by-userId で検索）
    const commentsResult = await docClient.send(new QueryCommand({
      TableName: Tables.comments,
      IndexName: Indexes.commentsByUserId,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
    }));

    if (commentsResult.Items && commentsResult.Items.length > 0) {
      for (const comment of commentsResult.Items) {
        // why: comments テーブルは PK=articleId + SK=commentId の複合キーのため、
        //      commentId 単独では ValidationException になる。両方を指定する。
        await docClient.send(new UpdateCommand({
          TableName: Tables.comments,
          Key: { articleId: comment.articleId, commentId: comment.commentId },
          UpdateExpression: 'SET userId = :null',
          ExpressionAttributeValues: { ':null': null },
        }));
      }
      logger.info(`[Withdraw] コメント更新: ${commentsResult.Items.length}件`);
    }

    // 2. usersドキュメントを物理削除
    await docClient.send(new DeleteCommand({
      TableName: Tables.users,
      // users テーブルの PK は docs/database-schema_v2.md の仕様に従い google_uid
      Key: { google_uid: userId },
    }));
    logger.info(`[Withdraw] ユーザードキュメント削除: ${userId}`);

    // 3. セッションクッキーを削除
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
    logger.info(`[Withdraw] 退会処理完了: userId=${userId}`);

    return NextResponse.json({
      success: true,
      message: '退会処理が完了しました',
    });

  } catch (error) {
    logger.error('[Withdraw] 退会処理エラー:', error);
    return NextResponse.json(
      { error: '退会処理に失敗しました。しばらく経ってから再度お試しください。' },
      { status: 500 }
    );
  }
}
