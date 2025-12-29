import { cookies } from 'next/headers';
import type { User as FirebaseUser } from 'firebase/auth';

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

// NOTE: This is still a mock for role management.
// In a real app, you would get roles from a database or custom claims.
async function getRoleForUser(user: FirebaseUser | null): Promise<UserRole> {
  if (!user) {
    return 'guest';
  }
  
  // This is a mock. In a real app, you'd check custom claims or a database.
  // For now, let's keep the cookie-based role switching for testing.
  const cookieStore = cookies();
  const roleCookie = cookieStore.get('user_role')?.value as UserRole | undefined;

  const validRoles: UserRole[] = ['free_member', 'paid_member', 'admin'];

  if (roleCookie && validRoles.includes(roleCookie)) {
    // If admin claim exists on Firebase user, force admin role.
    const idTokenResult = await user.getIdTokenResult();
    if (idTokenResult.claims.admin) {
      return 'admin';
    }
    return roleCookie;
  }
  
  const idTokenResult = await user.getIdTokenResult();
  if (idTokenResult.claims.admin) {
    return 'admin';
  }

  // Default to free_member if logged in but no specific role found in cookie
  return 'free_member';
}


// This function is now designed to be run on the server and relies on a session cookie
// that would be set by a server-side auth process (e.g., in a middleware or API route).
// For this prototype, we're simplifying and acknowledging the auth state is primarily client-driven.
export async function getUser(): Promise<User> {
  // This is a simplified mock. A real implementation needs server-side session management.
  // We'll continue to use the cookie for role-playing.
  const cookieStore = cookies();
  const roleCookie = cookieStore.get('user_role')?.value as UserRole | undefined;

  const role = ['guest', 'free_member', 'paid_member', 'admin'].includes(roleCookie || '') ? roleCookie : 'guest';

  if (role === 'guest' || !role) {
    return {
      isLoggedIn: false,
      role: 'guest',
    };
  }
  
  // Mock user data based on role
  const names: Record<UserRole, string> = {
    free_member: 'Free Member',
    paid_member: 'Paid Member',
    admin: 'Admin User',
    guest: '',
  };

  return {
    isLoggedIn: true,
    name: names[role as Exclude<UserRole, 'guest'>],
    role: role as Exclude<UserRole, 'guest'>,
  };
}
