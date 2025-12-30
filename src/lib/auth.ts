import { cookies } from 'next/headers';
import type { User as FirebaseUser } from 'firebase/auth';
import { hasValidAccess } from './user-access';

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
// The role is determined dynamically and is not stored in a cookie.
export async function getUser(): Promise<User> {
  // This is a simplified mock for server components.
  // Real server-side session management would be needed for a full implementation.
  // For now, it relies on a simple cookie to know if a user *might* be logged in.
  const cookieStore = cookies();
  const isLoggedIn = cookieStore.has('auth_state');

  if (!isLoggedIn) {
    return {
      isLoggedIn: false,
      role: 'guest',
    };
  }

  // We can't know the exact user on the server without a proper session.
  // We'll assume a generic logged-in state and the client `AuthProvider` will provide the real details.
  // The role here is just a placeholder and will be overridden on the client.
  return {
    isLoggedIn: true,
    role: 'free_member', 
  };
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
