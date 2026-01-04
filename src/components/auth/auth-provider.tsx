/**
 * 認証プロバイダー（最小化版）
 * 
 * ログイン/ログアウトのUI操作のみを担当します。
 * 認証状態の管理はサーバーサイド（セッションクッキー）で行います。
 * 
 * 【機能】
 * - Googleログインボタンの動作
 * - ログアウトボタンの動作
 * - ログイン処理中の状態管理
 * - 認証済みユーザー情報の保持
 * 
 * 【認証フロー】
 * 1. signIn() → Google OAuth画面にリダイレクト
 * 2. /auth/callback で id_token を受信
 * 3. /api/auth/session にPOST → セッションクッキー発行
 * 4. 元のページにリダイレクト
 */
'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { signInWithCredential, GoogleAuthProvider, signOut as firebaseSignOut, onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface AuthContextType {
  /** 認証済み Firebase User オブジェクト */
  user: User | null;
  /** ログイン処理中かどうか */
  isLoggingIn: boolean;
  /** Googleログインを開始 */
  signIn: () => Promise<void>;
  /** ログアウト */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoggingIn: false,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(true);

  // Firebase Auth の認証状態の変更を監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setIsLoggingIn(false);
    });
    return () => unsubscribe();
  }, []);

  const signIn = useCallback(async () => {
    try {
      setIsLoggingIn(true);
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      if (!clientId) throw new Error('Google Client ID が設定されていません');

      const currentPath = window.location.pathname + window.location.search;
      if (currentPath !== '/auth/callback') {
        sessionStorage.setItem('auth_return_url', currentPath);
      }

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
      
      window.location.href = authUrl.toString();
    } catch (error: any) {
      console.error('[Auth] ログインエラー:', error.message);
      alert(`ログインエラー: ${error.message}`);
      setIsLoggingIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
      await fetch('/api/auth/session', { method: 'DELETE' });
      window.location.href = '/';
    } catch (error) {
      console.error('[Auth] ログアウトエラー:', error);
    }
  }, []);

  const value = { user, isLoggingIn, signIn, signOut };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

export async function handleOAuthCallback(): Promise<{ success: boolean; returnUrl: string }> {
  const hash = window.location.hash;
  if (!hash) return { success: false, returnUrl: '/' };

  const params = new URLSearchParams(hash.substring(1));
  const idToken = params.get('id_token');
  const state = params.get('state');

  const savedState = sessionStorage.getItem('google_auth_state');
  if (state !== savedState) {
    console.error('[Auth] State不一致 - CSRF攻撃の可能性');
    return { success: false, returnUrl: '/' };
  }

  if (!idToken) {
    console.error('[Auth] id_tokenがありません');
    return { success: false, returnUrl: '/' };
  }

  try {
    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(auth, credential);
    const firebaseIdToken = await result.user.getIdToken();

    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: firebaseIdToken }),
    });

    if (!response.ok) throw new Error('セッション作成に失敗しました');

    const returnUrl = sessionStorage.getItem('auth_return_url') || '/';
    sessionStorage.removeItem('google_auth_state');
    sessionStorage.removeItem('google_auth_nonce');
    sessionStorage.removeItem('auth_return_url');
    window.location.hash = '';

    return { success: true, returnUrl };
  } catch (error: any) {
    console.error('[Auth] 認証エラー:', error.message);
    return { success: false, returnUrl: '/' };
  }
}
