/**
 * ヘッダーのクライアントコンポーネント
 * 
 * ログイン/ログアウトボタンやドロップダウンメニューなど、
 * インタラクティブなUI要素を担当します。
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import type { UserInfo } from '@/lib/auth';
import { LogIn, LogOut } from 'lucide-react';
import Image from 'next/image';

interface UserProfileClientProps {
  /** サーバーから取得したユーザー情報 */
  user: UserInfo | null;
}

export function UserProfileClient({ user }: UserProfileClientProps) {
  const { signIn, signOut, isLoggingIn } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // メニュー外クリックで閉じる
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (isLoggingIn) {
    return <div className="text-muted">ログイン中...</div>;
  }

  if (!user?.isLoggedIn) {
    return (
      <button onClick={signIn} className="btn btn--with-icon">
        <span>Googleでログイン</span>
      </button>
    );
  }

  return (
    <div className="dropdown" ref={menuRef}>
      <button 
        className="btn-icon"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        aria-expanded={isMenuOpen}
        aria-haspopup="true"
        aria-label="ユーザーメニューを開く"
      >
        {user.photoURL ? (
            <Image
              src={user.photoURL}
              alt={user.name || 'ユーザーアイコン'}
              width={28}
              height={28}
              style={{ borderRadius: '50%' }}
            />
        ) : (
            <div style={{width: 28, height: 28, background: '#ccc', borderRadius: '50%' }} />
        )}
      </button>

      {isMenuOpen && (
        <div className="dropdown__menu">
          <div className="dropdown__user-info">
            <div className="dropdown__user-name">{user.name}</div>
          </div>
          <hr />
          {user.role === 'admin' && (
            <a 
              href="/admin" 
              className="dropdown__item"
              onClick={() => setIsMenuOpen(false)}
            >
              管理ダッシュボード
            </a>
          )}
          <button 
            className="dropdown__item"
            onClick={() => {
              setIsMenuOpen(false);
              signOut();
            }}
          >
            <LogOut size={16} style={{marginRight: '8px'}} />
            ログアウト
          </button>
        </div>
      )}
    </div>
  );
}
