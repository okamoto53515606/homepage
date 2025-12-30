'use client';

import { useEffect, useState } from 'react';
import { handleOAuthCallback } from '@/components/auth/auth-provider';

/**
 * OAuth認証後のコールバックページ
 * 
 * Google OAuthからのリダイレクト先として機能します。
 * URLのハッシュフラグメントからid_tokenを取得し、
 * セッションクッキーを作成して元のページにリダイレクトします。
 */
export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function processCallback() {
      console.log('⏳ 認証処理中...');
      
      const result = await handleOAuthCallback();
      
      if (result.success) {
        // 成功 → 元のページにリダイレクト
        window.location.href = result.returnUrl;
      } else {
        setError('ログインに失敗しました。もう一度お試しください。');
        // 3秒後にトップページへ
        setTimeout(() => {
          window.location.href = '/';
        }, 3000);
      }
    }

    processCallback();
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      gap: '1rem'
    }}>
      {error ? (
        <p style={{ color: '#dc2626' }}>{error}</p>
      ) : (
        <>
          <div style={{
            width: '50px',
            height: '50px',
            border: '5px solid #f3f3f3',
            borderTop: '5px solid #3498db',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <p>ログイン処理中...</p>
        </>
      )}
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
