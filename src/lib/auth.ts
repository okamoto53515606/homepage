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
    
    // 管理者チェック（Custom Claims）
    if (decodedClaims.admin === true) {
      return {
        isLoggedIn: true,
        uid,
        email,
        name,
        photoURL,
        role: 'admin',
        accessExpiry: null,
      };
    }
    
    // 有料会員チェック（Firestoreのaccess_expiry）
    const accessExpiry = await getAccessExpiry(uid);
    
    return {
      isLoggedIn: true,
      uid,
      email,
      name,
      photoURL,
      role: accessExpiry && accessExpiry > new Date() ? 'paid_member' : 'free_member',
      accessExpiry: accessExpiry ? accessExpiry.toISOString() : null,
    };

  } catch (error) {
    console.error('[getUser] セッション検証エラー:', error);
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
    console.error('[getAccessExpiry] エラー:', error);
    return null;
  }
}
