
'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser, signInWithCredential, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import type { User, UserRole } from '@/lib/auth';
import { usePathname, useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { hasValidAccess, ensureUserDocument } from '@/lib/user-access';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const getRoleForUser = useCallback(async (firebaseUser: FirebaseUser | null): Promise<UserRole> => {
    if (!firebaseUser) return 'guest';
  
    // 1. 管理者かチェック (Custom Claims)
    const idTokenResult = await firebaseUser.getIdTokenResult(true); // Force refresh
    if (idTokenResult.claims.admin) {
      return 'admin';
    }
  
    // 2. 有料会員かチェック (Firestore)
    const hasAccess = await hasValidAccess(firebaseUser.uid);
    if (hasAccess) {
      return 'paid_member';
    }
    
    // 3. 上記以外は無料会員
    return 'free_member';
  }, []);

  useEffect(() => {
    let mounted = true;

    // Handle Google OAuth callback (カスタムOAuthフロー)
    const handleOAuthCallback = async () => {
      if (typeof window === 'undefined') return;

      const hash = window.location.hash;
      if (!hash) {
        return;
      }

      console.log('🔍 OAuth callback detected:', hash);

      // Parse the hash fragment
      const params = new URLSearchParams(hash.substring(1));
      const idToken = params.get('id_token');
      const state = params.get('state');

      // Verify state for CSRF protection
      const savedState = sessionStorage.getItem('google_auth_state');
      if (state !== savedState) {
        console.error('❌ State mismatch - possible CSRF attack');
        alert('認証エラー: セキュリティチェックに失敗しました');
        window.location.hash = '';
        return;
      }

      if (!idToken) {
        console.error('❌ No ID token found in callback');
        window.location.hash = '';
        return;
      }

      try {
        console.log('✅ ID token received, signing in to Firebase...');
        
        // Create credential and sign in to Firebase
        const credential = GoogleAuthProvider.credential(idToken);
        const result = await signInWithCredential(auth, credential);
        
        console.log('✅ Firebase sign-in successful:', {
          uid: result.user.uid,
          email: result.user.email,
        });

        // Get the original page to redirect back to
        const returnUrl = sessionStorage.getItem('auth_return_url');
        
        // Clean up
        sessionStorage.removeItem('google_auth_state');
        sessionStorage.removeItem('google_auth_nonce');
        sessionStorage.removeItem('auth_return_url');
        window.location.hash = '';
        
        // ハードリロードでリダイレクト
        // router.push() はクライアントナビゲーションでキャッシュが使われるため、
        // サーバーコンポーネントの getUser() が再実行されない問題がある。
        // window.location.href を使うことで、サーバーで最新のアクセス権をチェックできる。
        if (returnUrl && isValidReturnUrl(returnUrl)) {
          console.log('↩️ Hard redirecting to:', returnUrl);
          window.location.href = returnUrl;
        } else {
          console.log('🏠 Hard redirecting to home');
          window.location.href = '/';
        }
      } catch (error: any) {
        console.error('❌ Error signing in to Firebase:', {
          code: error.code,
          message: error.message,
        });
        alert(`Firebase認証エラー: ${error.message}`);
        window.location.hash = '';
      }
    };

    // Security: Validate return URL to prevent open redirect
    const isValidReturnUrl = (url: string): boolean => {
      try {
        return url.startsWith('/') && !url.startsWith('//');
      } catch {
        return false;
      }
    };

    handleOAuthCallback();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!mounted) return;

      if (firebaseUser) {
        // ログイン直後にusersコレクションにドキュメントを作成（存在しない場合のみ）
        await ensureUserDocument(firebaseUser);
        
        const role = await getRoleForUser(firebaseUser);
        setUser({
          isLoggedIn: true,
          uid: firebaseUser.uid,
          name: firebaseUser.displayName,
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL,
          role: role,
          firebaseUser: firebaseUser,
        });
        // Set cookies to reflect login status for server components
        Cookies.set('auth_state', 'loggedIn', { expires: 1 });
        Cookies.set('auth_uid', firebaseUser.uid, { expires: 1 });
      } else {
        setUser({ isLoggedIn: false, role: 'guest' });
        // Remove cookies on sign out
        Cookies.remove('auth_state');
        Cookies.remove('auth_uid');
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [router, getRoleForUser]);
  
  const signIn = async () => {
    try {
      console.log('🚀 Initiating Google Sign-In (Custom OAuth Flow)...');
      
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      if (!clientId) {
        throw new Error('Google Client ID not configured');
      }

      // Save current page for redirect after login
      const currentPath = window.location.pathname + window.location.search;
      if (currentPath !== '/auth/callback') {
        sessionStorage.setItem('auth_return_url', currentPath);
        console.log('💾 Saved return URL:', currentPath);
      }

      // Generate state and nonce for security
      const state = Math.random().toString(36).substring(2, 15);
      const nonce = Math.random().toString(36).substring(2, 15);
      
      sessionStorage.setItem('google_auth_state', state);
      sessionStorage.setItem('google_auth_nonce', nonce);
      
      const redirectUri = window.location.origin + '/auth/callback';
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'id_token');
      authUrl.searchParams.set('scope', 'openid email profile');
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('nonce', nonce);
      
      const fullAuthUrl = authUrl.toString();
      window.location.href = fullAuthUrl;
      
    } catch (error: any) {
      console.error('❌ Error initiating sign in:', error.message);
      alert(`サインインエラー: ${error.message}`);
    }
  };

  const signOutUser = async () => {
    try {
      await signOut(auth);
      router.push('/');
      router.refresh();
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  // 決済後にアクセス権が更新されたことを検知し、ユーザーのロールを再評価する
  useEffect(() => {
    // 決済成功ページから遷移してきたときだけチェック
    if (pathname === '/payment/success') {
      const recheckRole = async () => {
        if (user?.firebaseUser) {
          const newRole = await getRoleForUser(user.firebaseUser);
          if (newRole !== user.role) {
            setUser(currentUser => currentUser ? {...currentUser, role: newRole} : null);
            console.log(`User role updated to: ${newRole}`);
          }
        }
      };
      // 少し遅延させてWebhook処理完了を待つ
      setTimeout(recheckRole, 2000); 
    }
  }, [pathname, user, getRoleForUser]);


  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut: signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
