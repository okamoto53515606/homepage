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

// NOTE: This function is intended to be called from a server component/action.
// The role is determined dynamically based on Firestore access_expiry.
export async function getUser(): Promise<User> {
  // Next.js 15: cookies() is now a Promise that must be awaited
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

// This function provides dynamic role checking based on various sources.
// It's meant to be called from client-side logic where the FirebaseUser object is available.
export async function determineUserRole(firebaseUser: FirebaseUser | null): Promise<UserRole> {
  if (!firebaseUser) {
    return 'guest';
  }

  // 1. Check for admin role via custom claims (highest priority)
  const idTokenResult = await firebaseUser.getIdTokenResult(true); // Force refresh
  if (idTokenResult.claims.admin) {
    return 'admin';
  }

  // 2. Check for paid access via Firestore
  const userHasValidAccess = await hasValidAccess(firebaseUser.uid);
  if (userHasValidAccess) {
    return 'paid_member';
  }
  
  // 3. If logged in but not admin or paid, they are a free member
  return 'free_member';
}
