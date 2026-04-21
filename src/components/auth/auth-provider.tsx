/**
 * 認証プロバイダー
 *
 * ログイン/ログアウトのUI操作のみを担当します。
 * 認証状態の管理はサーバーサイド（セッションクッキー）で行います。
 *
 * 【認証フロー】
 * 1. signIn() → /api/auth/google/start に遷移
 * 2. サーバー側で PKCE を生成して Google OAuth 画面にリダイレクト
 * 3. /api/auth/google/callback で code exchange + セッションクッキー発行
 * 4. 元のページにリダイレクト
 */
'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return '不明なエラーが発生しました';
}

interface AuthUser {
  uid: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoggingIn: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoggingIn: false,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user] = useState<AuthUser | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const signIn = useCallback(async () => {
    try {
      setIsLoggingIn(true);
      const currentPath = window.location.pathname + window.location.search;
      const returnTo = currentPath === '/auth/callback' ? '/' : currentPath;
      window.location.href = `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`;
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      console.error('[Auth] ログインエラー:', message);
      alert(`ログインエラー: ${message}`);
      setIsLoggingIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
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
