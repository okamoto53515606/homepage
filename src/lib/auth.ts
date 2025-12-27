import { cookies } from 'next/headers';

export type UserRole = 'guest' | 'free_member' | 'paid_member' | 'admin';

export interface User {
  isLoggedIn: boolean;
  name?: string;
  role: UserRole;
}

// This is a mock authentication function.
// In a real application, you would integrate with Firebase Auth or another auth provider.
// This function reads a cookie to simulate different user roles for demonstration purposes.
// You can change the role by setting the 'user-role' cookie in your browser's developer tools.
// Valid values are 'guest', 'free_member', 'paid_member', 'admin'.

export async function getUser(): Promise<User> {
  const cookieStore = cookies();
  const roleCookie = cookieStore.get('user_role')?.value as UserRole | undefined;

  const role = ['guest', 'free_member', 'paid_member', 'admin'].includes(roleCookie || '') ? roleCookie : 'guest';

  if (role === 'guest') {
    return {
      isLoggedIn: false,
      role: 'guest',
    };
  }

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
