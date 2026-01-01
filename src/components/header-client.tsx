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
import { LogOut, Crown, User } from 'lucide-react';

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
      <button onClick={signIn} className="btn">
        <span>Googleでログイン</span>
      </button>
    );
  }

  // 支払い状況に基づいて表示を決定
  const isPaid = user.accessExpiry && new Date(user.accessExpiry) > new Date();
  const membershipText = isPaid ? '有料会員' : '無料会員';
  const membershipIcon = isPaid ? 
    <Crown size={16} style={{marginRight: '8px', color: '#f59e0b'}} /> : 
    <User size={16} style={{marginRight: '8px'}} />;

  return (
    <div className="dropdown" ref={menuRef}>
      <button 
        className="btn-icon"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        aria-expanded={isMenuOpen}
        aria-haspopup="true"
        aria-label="ユーザーメニューを開く"
      >
        {/* Googleのプロフィール画像を通常のimgタグで表示 */}
        <img
          src={user.photoURL!}
          alt={user.name || 'ユーザーアイコン'}
          width={28}
          height={28}
          style={{ borderRadius: '50%' }}
        />
      </button>

      {isMenuOpen && (
        <div className="dropdown__menu">
          <div className="dropdown__user-info">
            <div className="dropdown__user-name">{user.name}</div>
          </div>
          <hr />
          <div className="dropdown__item" style={{cursor: 'default'}}>
             {membershipIcon}
             <span>{membershipText}</span>
          </div>
          
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
