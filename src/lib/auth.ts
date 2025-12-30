/**
 * 認証ユーティリティ
 * 
 * サーバーサイドでのユーザー認証状態の取得とロール判定を行います。
 * 
 * 【ロール判定の仕組み】
 * - guest: 未ログイン
 * - free_member: ログイン済み、有料アクセス権なし
 * - paid_member: ログイン済み、Firestoreのaccess_expiryが有効
 * - admin: Firebase AuthのCustom Claimsでadmin: true
 * 
 * 【注意】
 * DBにはroleフィールドを持たず、access_expiryから動的に判定します。
 */

import { cookies } from 'next/headers';
import type { User as FirebaseUser } from 'firebase/auth';
import { hasValidAccess } from './user-access';
import { hasValidAccessAdmin } from './user-access-admin';

export type UserRole = 'guest' | 'free_member' | 'paid_member' | 'admin';

export interface User {
  isLoggedIn: boolean;
  uid?: string;
  name?: string | null;
  email?: string | null;
  photoURL?: string | null;
  role: UserRole;
  firebaseUser?: FirebaseUser;
}

/**
 * サーバーコンポーネント/アクションから呼び出す関数
 * ロールはFirestoreのaccess_expiryから動的に判定
 */
export async function getUser(): Promise<User> {
  // Next.js 15: cookies()は非同期になったためawaitが必要
  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.has('auth_state');
  const userId = cookieStore.get('auth_uid')?.value;

  if (!isLoggedIn || !userId) {
    return {
      isLoggedIn: false,
      role: 'guest',
    };
  }

  // Admin SDK を使用して access_expiry をチェック
  try {
    console.log('[getUser] Checking access for user:', userId);
    const hasPaidAccess = await hasValidAccessAdmin(userId);
    console.log('[getUser] hasPaidAccess:', hasPaidAccess);
    
    return {
      isLoggedIn: true,
      uid: userId,
      role: hasPaidAccess ? 'paid_member' : 'free_member',
    };
  } catch (error) {
    console.error('[getUser] Failed to check user access:', error);
    // エラー時は free_member として扱う
    return {
      isLoggedIn: true,
      uid: userId,
      role: 'free_member',
    };
  }
}

/**
 * クライアントサイドから呼び出す動的ロール判定関数
 * FirebaseUserオブジェクトが利用可能な場合に使用
 */
export async function determineUserRole(firebaseUser: FirebaseUser | null): Promise<UserRole> {
  if (!firebaseUser) {
    return 'guest';
  }

  // 1. 管理者ロールをCustom Claimsでチェック（最優先）
  const idTokenResult = await firebaseUser.getIdTokenResult(true); // 強制リフレッシュ
  if (idTokenResult.claims.admin) {
    return 'admin';
  }

  // 2. Firestoreで有料アクセス権をチェック
  const userHasValidAccess = await hasValidAccess(firebaseUser.uid);
  if (userHasValidAccess) {
    return 'paid_member';
  }
  
  // 3. ログイン済みだが管理者でも有料会員でもない場合は無料会員
  return 'free_member';
}
