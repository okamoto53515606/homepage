/**
 * 退会（アカウント削除）API
 * 
 * ユーザーの退会処理を行います。
 * 
 * 【処理内容】
 * 1. usersドキュメントを物理削除
 * 2. commentsのuserIdをnull化
 * 3. paymentsはuser_idを保持（会計・税務上の理由）
 * 4. Firebase Authのユーザーを削除
 * 5. セッションクッキーを削除
 * 
 * 【エンドポイント】
 * DELETE /api/auth/withdraw - 退会処理
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { logger } from '@/lib/env';

/** セッションクッキー名 */
const SESSION_COOKIE_NAME = 'session';

/**
 * DELETE: 退会処理
 * 
 * ログイン中のユーザーのアカウントを完全に削除
 */
export async function DELETE() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    // セッションクッキーがない場合はエラー
    if (!sessionCookie) {
      return NextResponse.json(
        { error: 'ログインが必要です' },
        { status: 401 }
      );
    }

    const auth = getAdminAuth();
    const db = getAdminDb();

    // セッションクッキーを検証してユーザーIDを取得
    let uid: string;
    try {
      const decodedClaims = await auth.verifySessionCookie(sessionCookie, true);
      uid = decodedClaims.uid;
    } catch {
      return NextResponse.json(
        { error: 'セッションが無効です。再度ログインしてください。' },
        { status: 401 }
      );
    }

    logger.info(`[Withdraw] 退会処理開始: uid=${uid}`);

    // 1. commentsのuserIdをnull化
    const commentsSnapshot = await db.collection('comments')
      .where('userId', '==', uid)
      .get();

    const batch = db.batch();
    commentsSnapshot.forEach((doc) => {
      batch.update(doc.ref, {
        userId: null,
      });
    });

    if (!commentsSnapshot.empty) {
      await batch.commit();
      logger.info(`[Withdraw] コメント更新: ${commentsSnapshot.size}件`);
    }

    // 2. usersドキュメントを物理削除
    const userRef = db.collection('users').doc(uid);
    await userRef.delete();
    logger.info(`[Withdraw] ユーザードキュメント削除: ${uid}`);

    // 3. Firebase Authのユーザーを削除（これによりIDトークンも無効化される）
    await auth.deleteUser(uid);
    logger.info(`[Withdraw] Firebase Authユーザー削除: ${uid}`);

    // 4. セッションクッキーを削除
    cookieStore.delete(SESSION_COOKIE_NAME);
    logger.info(`[Withdraw] 退会処理完了: uid=${uid}`);

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
