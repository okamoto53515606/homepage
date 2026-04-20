/**
 * セッション管理API
 * 
 * Google OAuth の id_token を検証し、カスタム JWT のセッションクッキーを発行します。
 * 
 * 【エンドポイント】
 * POST /api/auth/session - セッション作成（ログイン）
 * DELETE /api/auth/session - セッション破棄（ログアウト）
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SignJWT, decodeJwt } from 'jose';
import { PutCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getDocClient, Tables } from '@/lib/dynamodb';
import { logger, getSessionDurationHours } from '@/lib/env';
import { getGoogleOAuthConfig } from '@/lib/google-oauth';

const SESSION_EXPIRY_HOURS = getSessionDurationHours();
const SESSION_EXPIRY_SECONDS = SESSION_EXPIRY_HOURS * 60 * 60;

const SESSION_COOKIE_NAME = 'session';

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return new TextEncoder().encode(secret);
}

/**
 * Google の id_token を検証する
 * Google の公開鍵で署名を検証し、クレームを返す
 */
async function verifyGoogleIdToken(idToken: string): Promise<{
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}> {
  // Google の JWKS エンドポイントから公開鍵を取得
  const { createRemoteJWKSet, jwtVerify } = await import('jose');
  const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  
  const { clientId } = await getGoogleOAuthConfig();
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: clientId,
  });

  if (!payload.sub) {
    throw new Error('Google id_token に sub クレームがありません');
  }

  return {
    sub: payload.sub as string,
    email: payload.email as string | undefined,
    name: payload.name as string | undefined,
    picture: payload.picture as string | undefined,
  };
}

/**
 * ユーザードキュメントを作成または更新
 */
async function ensureUserDocument(user: {
  userId: string;
  email?: string;
  name?: string;
  picture?: string;
}): Promise<void> {
  const docClient = getDocClient();
  const now = new Date().toISOString();
  
  const result = await docClient.send(new GetCommand({
    TableName: Tables.users,
    Key: { userId: user.userId },
  }));

  if (!result.Item) {
    // 新規ユーザー
    await docClient.send(new PutCommand({
      TableName: Tables.users,
      Item: {
        userId: user.userId,
        email: user.email || null,
        displayName: user.name || null,
        photoURL: user.picture || null,
        created_at: now,
        updated_at: now,
      },
    }));
    logger.info(`[Session] 新規ユーザードキュメント作成: ${user.userId}`);
  } else {
    // 既存ユーザー: 最終ログイン時刻を更新
    await docClient.send(new UpdateCommand({
      TableName: Tables.users,
      Key: { userId: user.userId },
      UpdateExpression: 'SET email = :email, displayName = :name, photoURL = :photo, updated_at = :now',
      ExpressionAttributeValues: {
        ':email': user.email || null,
        ':name': user.name || null,
        ':photo': user.picture || null,
        ':now': now,
      },
    }));
    logger.info(`[Session] ユーザードキュメント更新: ${user.userId}`);
  }
}

/**
 * POST: セッション作成（ログイン）
 * 
 * Google OAuth id_token を受け取り、検証後にカスタム JWT をセッションクッキーとして発行
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

    // Google id_token を検証
    const googleUser = await verifyGoogleIdToken(idToken);
    const userId = googleUser.sub; // google_uid を PK として使用

    // ユーザードキュメントを作成/更新
    await ensureUserDocument({
      userId,
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture,
    });

    // カスタム JWT を作成
    const jwt = await new SignJWT({
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${SESSION_EXPIRY_HOURS}h`)
      .sign(getJwtSecret());

    // クッキーを設定
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_EXPIRY_SECONDS,
      path: '/',
    });

    logger.info(`[Session] セッション作成: userId=${userId}`);

    return NextResponse.json({
      success: true,
      uid: userId,
    });

  } catch (error: unknown) {
    const errorMessage = (error as { message?: string })?.message;
    logger.error(`[Session] セッション作成エラー: ${errorMessage}`);
    
    return NextResponse.json(
      { error: 'セッションの作成に失敗しました' },
      { status: 401 }
    );
  }
}

/**
 * DELETE: セッション破棄（ログアウト）
 */
export async function DELETE() {
  try {
    const cookieStore = await cookies();
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
