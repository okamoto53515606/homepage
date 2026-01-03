/**
 * 認証ユーティリティ（サーバーサイド専用）
 * 
 * HttpOnlyセッションクッキーを使用してユーザー認証状態を管理します。
 * 
 * 【認証フロー】
 * 1. クライアントでGoogleログイン → id_token取得
 * 2. /api/auth/session にPOST → セッションクッキー発行
 * 3. 以降、getUser()でセッションを検証
 * 
 * 【ロール判定の仕組み】
 * - guest: 未ログイン
 * - free_member: ログイン済み、有料アクセス権なし
 * - paid_member: ログイン済み、Firestoreのaccess_expiryが有効
 * - admin: Firebase AuthのCustom Claimsでadmin: true
 * 
 * 【セキュリティ】
 * - HttpOnly: JavaScriptからアクセス不可（XSS対策）
 * - セッションはサーバーで検証
 */

import { cookies } from 'next/headers';
import { getAdminAuth, getAdminDb } from './firebase-admin';
import { logger } from './env';

export type UserRole = 'guest' | 'free_member' | 'paid_member' | 'admin';

export interface User {
  isLoggedIn: boolean;
  uid?: string;
  name?: string | null;
  email?: string | null;
  photoURL?: string | null;
  role: UserRole;
  accessExpiry?: string | null;
}

/** UserInfoはUserのエイリアス（コンポーネントからの参照用） */
export type UserInfo = User;

/** セッションクッキー名 */
const SESSION_COOKIE_NAME = 'session';

/**
 * サーバーコンポーネント/アクションから呼び出す関数
 * セッションクッキーを検証し、ユーザー情報とロールを返す
 */
export async function getUser(): Promise<User> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  // セッションクッキーがない場合はゲスト
  if (!sessionCookie) {
    return {
      isLoggedIn: false,
      role: 'guest',
    };
  }

  try {
    const auth = getAdminAuth();
    
    // セッションクッキーを検証
    const decodedClaims = await auth.verifySessionCookie(sessionCookie, true);
    
    const uid = decodedClaims.uid;
    const email = decodedClaims.email;
    const name = decodedClaims.name;
    const photoURL = decodedClaims.picture;
    
    // ユーザーのロールを決定
    let role: UserRole = 'free_member'; // デフォルトは無料会員
    if (decodedClaims.admin === true) {
      role = 'admin';
    }
    
    // 有料会員チェック（Firestoreのaccess_expiry）
    const accessExpiry = await getAccessExpiry(uid);
    const isPaidMember = accessExpiry && accessExpiry > new Date();

    // 管理者であっても、支払い状況に応じて表示を分けるため、
    // paid_member のステータスは admin とは別に判定する
    if (isPaidMember && role !== 'admin') {
      role = 'paid_member';
    }
    
    return {
      isLoggedIn: true,
      uid,
      email,
      name,
      photoURL,
      // 管理者かどうかをroleで渡しつつ、有料会員情報も渡す
      role: decodedClaims.admin === true ? 'admin' : (isPaidMember ? 'paid_member' : 'free_member'),
      accessExpiry: accessExpiry ? accessExpiry.toISOString() : null,
    };

  } catch (error: unknown) {
    // Firebase Authのエラーは通常のErrorと異なる構造のため、詳細をログ出力
    const errorCode = (error as { code?: string })?.code;
    const errorMessage = (error as { message?: string })?.message;
    
    // セッション期限切れや無効なセッションは想定内なのでwarnレベル
    if (errorCode === 'auth/session-cookie-expired' || errorCode === 'auth/session-cookie-revoked') {
      logger.info(`[getUser] セッション期限切れ: ${errorCode}`);
    } else if (errorCode === 'auth/argument-error') {
      // 不正なセッションクッキー形式（古いクッキーが残っている場合など）
      logger.info(`[getUser] 無効なセッション形式: ${errorCode}`);
    } else {
      logger.error(`[getUser] セッション検証エラー: code=${errorCode}, message=${errorMessage}`);
    }
    // セッションが無効な場合はゲストとして扱う
    return {
      isLoggedIn: false,
      role: 'guest',
    };
  }
}

/**
 * Firestoreでユーザーの有料アクセス権の有効期限を取得
 */
async function getAccessExpiry(uid: string): Promise<Date | null> {
  try {
    const db = getAdminDb();
    const userDoc = await db.collection('users').doc(uid).get();
    
    if (!userDoc.exists) {
      return null;
    }
    
    const data = userDoc.data();
    const expiry = data?.access_expiry?.toDate();
    
    return expiry || null;

  } catch (error) {
    logger.error('[getAccessExpiry] エラー:', error);
    return null;
  }
}
