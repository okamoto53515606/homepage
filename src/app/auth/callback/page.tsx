'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * OAuth認証後のコールバックページ
 * 認証処理後、元のページにリダイレクトする
 */
export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // OAuth callback処理は auth-provider.tsx で実行される
    // ここでは単にローディング表示のみ
    console.log('⏳ 認証処理中...');
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
      <div style={{
        width: '50px',
        height: '50px',
        border: '5px solid #f3f3f3',
        borderTop: '5px solid #3498db',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
      <p>ログイン処理中...</p>
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
