
'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser, signInWithCredential, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import type { User, UserRole } from '@/lib/auth';
import { usePathname, useRouter } from 'next/navigation';
import Cookies from 'js-cookie';

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

async function getRoleForUser(firebaseUser: FirebaseUser | null): Promise<UserRole> {
  if (!firebaseUser) return 'guest';
  
  // This is a mock for prototype purposes.
  // In a real app, roles would be fetched from a backend or custom claims.
  const idTokenResult = await firebaseUser.getIdTokenResult(true); // Force refresh
  if (idTokenResult.claims.admin) {
    return 'admin';
  }

  // For testing, we allow role switching via cookie.
  const roleCookie = Cookies.get('user_role') as UserRole;
  if (roleCookie && ['free_member', 'paid_member', 'admin'].includes(roleCookie)) {
     if (idTokenResult.claims.admin) return 'admin'; // Admin claim overrides cookie
     return roleCookie;
  }
  
  // TODO: Check for paid status in Firestore
  // const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
  // if (userDoc.exists() && userDoc.data().access_expiry > new Date()) {
  //   return 'paid_member';
  // }

  return 'free_member';
}


export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let mounted = true;

    // Handle Google OAuth callback (カスタムOAuthフロー)
    const handleOAuthCallback = async () => {
      if (typeof window === 'undefined') return;

      const hash = window.location.hash;
      if (!hash) {
        console.log('ℹ️ No OAuth callback (normal page load)');
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
          displayName: result.user.displayName,
        });

        // Get the original page to redirect back to
        const returnUrl = sessionStorage.getItem('auth_return_url');
        
        // Clean up
        sessionStorage.removeItem('google_auth_state');
        sessionStorage.removeItem('google_auth_nonce');
        sessionStorage.removeItem('auth_return_url');
        window.location.hash = '';
        
        // Redirect to the original page or home
        if (returnUrl && isValidReturnUrl(returnUrl)) {
          console.log('↩️ Redirecting to:', returnUrl);
          router.push(returnUrl);
        } else {
          console.log('🏠 Redirecting to home');
          router.push('/');
        }
        
        router.refresh();
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
        // Allow only relative URLs (same origin)
        return url.startsWith('/') && !url.startsWith('//');
      } catch {
        return false;
      }
    };

    handleOAuthCallback();

    // Then set up the auth state listener
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!mounted) return;

      console.log('🔄 Auth state changed:', firebaseUser ? {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
      } : 'signed out');

      if (firebaseUser) {
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
        // Set a cookie to reflect login status for server components
        Cookies.set('user_role', role, { expires: 1 });
      } else {
        setUser({ isLoggedIn: false, role: 'guest' });
        // Remove cookie on sign out
        Cookies.remove('user_role');
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [router]);
  
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
      
      // Save state for CSRF verification
      sessionStorage.setItem('google_auth_state', state);
      sessionStorage.setItem('google_auth_nonce', nonce);
      
      // Build Google OAuth URL with fixed callback endpoint
      const redirectUri = window.location.origin + '/auth/callback';
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'id_token');
      authUrl.searchParams.set('scope', 'openid email profile');
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('nonce', nonce);
      
      const fullAuthUrl = authUrl.toString();
      console.log('📍 Redirecting to Google OAuth...');
      console.log('🔙 Callback URL:', redirectUri);
      console.log('🔗 Full OAuth URL:', fullAuthUrl);
      console.log('📋 Parameters:', {
        client_id: clientId.substring(0, 20) + '...',
        redirect_uri: redirectUri,
        response_type: 'id_token',
        scope: 'openid email profile',
        state: state,
        nonce: nonce
      });
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

  // This effect listens for changes on the user_role cookie and updates the user state.
  useEffect(() => {
    const interval = setInterval(async () => {
        if(user?.firebaseUser){
            const newRole = await getRoleForUser(user.firebaseUser);
            if(newRole !== user.role) {
                setUser(currentUser => currentUser ? {...currentUser, role: newRole} : null);
                // No need to refresh the page, just update the context state.
                // The UI will react to the context change.
            }
        }
    }, 1000);
    return () => clearInterval(interval);
  }, [user]);


  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut: signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
