/**
 * セッション管理API
 * 
 * Firebase Authのid_tokenを検証し、HttpOnlyセッションクッキーを発行します。
 * 
 * 【エンドポイント】
 * POST /api/auth/session - セッション作成（ログイン）
 * DELETE /api/auth/session - セッション破棄（ログアウト）
 * 
 * 【セキュリティ】
 * - HttpOnly: JavaScriptからアクセス不可（XSS対策）
 * - Secure: HTTPS必須（本番環境）
 * - SameSite=Lax: CSRF対策
 * - 有効期限: 5日間
 * 
 * 【ユーザードキュメント】
 * ログイン時にFirestoreのusersコレクションにユーザー情報を保存します。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from '@/lib/env';

/** セッションの有効期限（5日間） */
const SESSION_EXPIRY_DAYS = 5;
const SESSION_EXPIRY_MS = SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

/** クッキー名 */
const SESSION_COOKIE_NAME = 'session';

/**
 * ユーザードキュメントを作成または更新
 * ログイン時に呼び出され、ユーザー情報をFirestoreに保存
 */
async function ensureUserDocument(user: {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}): Promise<void> {
  const db = getAdminDb();
  const userRef = db.collection('users').doc(user.uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    // 新規ユーザー: ドキュメント作成
    await userRef.set({
      uid: user.uid,
      email: user.email || null,
      displayName: user.name || null,
      photoURL: user.picture || null,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    logger.info(`[Session] 新規ユーザードキュメント作成: ${user.uid}`);
  } else {
    // 既存ユーザー: 最終ログイン時刻を更新
    await userRef.update({
      email: user.email || null,
      displayName: user.name || null,
      photoURL: user.picture || null,
      updated_at: FieldValue.serverTimestamp(),
    });
    logger.info(`[Session] ユーザードキュメント更新: ${user.uid}`);
  }
}

/**
 * POST: セッション作成（ログイン）
 * 
 * クライアントからid_tokenを受け取り、検証後にセッションクッキーを発行
 */
export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json(
        { error: 'id_tokenが必要です' },
        { status: 400 }
      );
    }

    const auth = getAdminAuth();

    // id_tokenを検証
    const decodedToken = await auth.verifyIdToken(idToken);
    
    // ユーザードキュメントを作成/更新
    await ensureUserDocument({
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
      picture: decodedToken.picture,
    });
    
    // セッションクッキーを作成
    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRY_MS,
    });

    // クッキーを設定
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60, // 秒単位
      path: '/',
    });

    logger.info(`[Session] セッション作成: uid=${decodedToken.uid}`);

    return NextResponse.json({
      success: true,
      uid: decodedToken.uid,
    });

  } catch (error: unknown) {
    // Firebase Authのエラーは通常のErrorと異なる構造のため、詳細をログ出力
    const errorCode = (error as { code?: string })?.code;
    const errorMessage = (error as { message?: string })?.message;
    
    if (errorCode === 'auth/id-token-expired') {
      logger.warn(`[Session] IDトークン期限切れ: ${errorCode}`);
    } else if (errorCode === 'auth/invalid-id-token' || errorCode === 'auth/argument-error') {
      logger.warn(`[Session] 無効なIDトークン: ${errorCode}`);
    } else {
      logger.error(`[Session] セッション作成エラー: code=${errorCode}, message=${errorMessage}`);
    }
    
    return NextResponse.json(
      { error: 'セッションの作成に失敗しました' },
      { status: 401 }
    );
  }
}

/**
 * DELETE: セッション破棄（ログアウト）
 * 
 * セッションクッキーを削除
 */
export async function DELETE() {
  try {
    const cookieStore = await cookies();
    
    // セッションクッキーを取得して無効化
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    
    if (sessionCookie) {
      try {
        const auth = getAdminAuth();
        const decodedClaims = await auth.verifySessionCookie(sessionCookie);
        // ユーザーのリフレッシュトークンを無効化（オプション）
        await auth.revokeRefreshTokens(decodedClaims.uid);
        logger.info(`[Session] セッション破棄: uid=${decodedClaims.uid}`);
      } catch {
        // セッションが無効でも続行
      }
    }

    // クッキーを削除
    cookieStore.delete(SESSION_COOKIE_NAME);

    return NextResponse.json({ success: true });

  } catch (error) {
    logger.error('[Session] セッション破棄エラー:', error);
    return NextResponse.json(
      { error: 'ログアウトに失敗しました' },
      { status: 500 }
    );
  }
}
