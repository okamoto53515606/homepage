/**
 * 認証ユーティリティ（サーバーサイド専用）
 * 
 * HttpOnlyセッションクッキーを使用してユーザー認証状態を管理します。
 * 
 * 【認証フロー】
 * 1. クライアントでGoogle OAuthログイン → id_token取得
 * 2. /api/auth/session にPOST → カスタムJWT発行 → セッションクッキーとして設定
 * 3. 以降、getUser()でJWTを検証
 * 
 * 【ロール判定の仕組み】
 * - guest: 未ログイン
 * - free_member: ログイン済み、有料アクセス権なし
 * - paid_member: ログイン済み、DynamoDBのaccess_expiryが有効
 */

import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { getDocClient, Tables } from './dynamodb';
import { logger } from './env';

export type UserRole = 'guest' | 'free_member' | 'paid_member';

export interface User {
  isLoggedIn: boolean;
  uid?: string;
  name?: string | null;
  email?: string | null;
  photoURL?: string | null;
  role: UserRole;
  accessExpiry?: string | null;
}

export type UserInfo = User;

const SESSION_COOKIE_NAME = 'session';

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return new TextEncoder().encode(secret);
}

/**
 * サーバーコンポーネント/アクションから呼び出す関数
 * セッションクッキー（JWT）を検証し、ユーザー情報とロールを返す
 */
export async function getUser(): Promise<User> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    return { isLoggedIn: false, role: 'guest' };
  }

  try {
    const { payload } = await jwtVerify(sessionCookie, getJwtSecret(), {
      algorithms: ['HS256'],
    });

    const uid = payload.sub as string;
    const email = payload.email as string | undefined;
    const name = payload.name as string | undefined;
    const photoURL = payload.picture as string | undefined;

    let role: UserRole = 'free_member';

    // 有料会員チェック（DynamoDBのaccess_expiry）
    const accessExpiry = await getAccessExpiry(uid);
    const isPaidMember = accessExpiry && accessExpiry > new Date();

    if (isPaidMember) {
      role = 'paid_member';
    }

    return {
      isLoggedIn: true,
      uid,
      email,
      name,
      photoURL,
      role,
      accessExpiry: accessExpiry ? accessExpiry.toISOString() : null,
    };

  } catch (error: unknown) {
    const errorMessage = (error as { message?: string })?.message;
    if (errorMessage?.includes('expired')) {
      logger.info(`[getUser] JWT期限切れ`);
    } else {
      logger.error(`[getUser] JWT検証エラー: ${errorMessage}`);
    }
    return { isLoggedIn: false, role: 'guest' };
  }
}

/**
 * DynamoDBでユーザーの有料アクセス権の有効期限を取得
 */
async function getAccessExpiry(uid: string): Promise<Date | null> {
  try {
    const result = await getDocClient().send(new GetCommand({
      TableName: Tables.users,
      Key: { userId: uid },
      ProjectionExpression: 'access_expiry',
    }));

    if (!result.Item?.access_expiry) {
      return null;
    }

    const expiry = new Date(result.Item.access_expiry);
    return isNaN(expiry.getTime()) ? null : expiry;
  } catch (error) {
    logger.error('[getAccessExpiry] エラー:', error);
    return null;
  }
}
