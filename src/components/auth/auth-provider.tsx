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
 * 
 * 【認証フロー】
 * 1. signIn() → Google OAuth画面にリダイレクト
 * 2. /auth/callback で id_token を受信
 * 3. /api/auth/session にPOST → セッションクッキー発行
 * 4. 元のページにリダイレクト
 * 
 * 【注意】
 * - Firestoreへのアクセスは行いません（サーバー側で処理）
 * - 認証状態はサーバーコンポーネントで取得（getUser()）
 */
'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { signInWithCredential, GoogleAuthProvider, signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface AuthContextType {
  /** ログイン処理中かどうか */
  isLoggingIn: boolean;
  /** Googleログインを開始 */
  signIn: () => Promise<void>;
  /** ログアウト */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isLoggingIn: false,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  /**
   * Googleログインを開始
   * Google OAuth画面にリダイレクトし、認証後に/auth/callbackに戻る
   */
  const signIn = useCallback(async () => {
    try {
      setIsLoggingIn(true);
      console.log('[Auth] Googleログイン開始...');
      
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      if (!clientId) {
        throw new Error('Google Client ID が設定されていません');
      }

      // ログイン後のリダイレクト先を保存
      const currentPath = window.location.pathname + window.location.search;
      if (currentPath !== '/auth/callback') {
        sessionStorage.setItem('auth_return_url', currentPath);
      }

      // CSRF対策のstateとnonceを生成
      const state = Math.random().toString(36).substring(2, 15);
      const nonce = Math.random().toString(36).substring(2, 15);
      
      sessionStorage.setItem('google_auth_state', state);
      sessionStorage.setItem('google_auth_nonce', nonce);
      
      // Google OAuth URLを構築
      const redirectUri = window.location.origin + '/auth/callback';
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'id_token');
      authUrl.searchParams.set('scope', 'openid email profile');
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('nonce', nonce);
      
      // Google OAuth画面にリダイレクト
      window.location.href = authUrl.toString();
      
    } catch (error: any) {
      console.error('[Auth] ログインエラー:', error.message);
      alert(`ログインエラー: ${error.message}`);
      setIsLoggingIn(false);
    }
  }, []);

  /**
   * ログアウト
   * セッションクッキーを削除し、トップページにリダイレクト
   */
  const signOut = useCallback(async () => {
    try {
      // Firebase Authからサインアウト
      await firebaseSignOut(auth);
      
      // サーバーのセッションを破棄
      await fetch('/api/auth/session', { method: 'DELETE' });
      
      // トップページにリダイレクト（ハードリロードでサーバー状態を反映）
      window.location.href = '/';
      
    } catch (error) {
      console.error('[Auth] ログアウトエラー:', error);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ isLoggingIn, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

/**
 * OAuthコールバック処理
 * /auth/callback ページから呼び出される
 */
export async function handleOAuthCallback(): Promise<{ success: boolean; returnUrl: string }> {
  const hash = window.location.hash;
  if (!hash) {
    return { success: false, returnUrl: '/' };
  }

  // ハッシュフラグメントをパース
  const params = new URLSearchParams(hash.substring(1));
  const idToken = params.get('id_token');
  const state = params.get('state');

  // CSRF保護のためstateを検証
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
    // Firebase Authにサインイン
    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(auth, credential);
    
    console.log('[Auth] Firebaseサインイン成功:', result.user.uid);

    // 新しいid_tokenを取得（Firebase発行のもの）
    const firebaseIdToken = await result.user.getIdToken();

    // サーバーにセッションを作成
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: firebaseIdToken }),
    });

    if (!response.ok) {
      throw new Error('セッション作成に失敗しました');
    }

    console.log('[Auth] セッション作成成功');

    // クリーンアップ
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
