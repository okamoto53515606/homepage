/**
 * ヘッダーのクライアントコンポーネント
 * 
 * ドロップダウンメニューやログイン/ログアウトボタンなど、
 * インタラクティブなUI要素を担当します。
 * 
 * 【クライアントコンポーネント】
 * ユーザー情報はサーバーコンポーネントからpropsで受け取ります。
 * 認証操作（signIn/signOut）のみをクライアントで実行します。
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/auth-provider';
import type { UserInfo } from '@/lib/auth';

interface UserProfileClientProps {
  /** サーバーから取得したユーザー情報 */
  user: UserInfo | null;
}

/**
 * ユーザープロフィールコンポーネント
 * 
 * サーバーから受け取ったユーザー情報を表示し、
 * ログイン/ログアウトのアクションを提供します。
 */
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

  // ログイン処理中
  if (isLoggingIn) {
    return <div className="text-muted">ログイン中...</div>;
  }

  // 未ログイン
  if (!user || !user.isLoggedIn) {
    return (
      <button className="btn" onClick={signIn}>
        Googleでログイン
      </button>
    );
  }

  // ログイン済み: ロール表示名
  const roleDisplayNames: Record<string, string> = {
    guest: 'ゲスト',
    free_member: '無料会員',
    paid_member: '有料会員',
    admin: '管理者',
  };

  return (
    <div className="dropdown" ref={menuRef}>
      {/* アバターボタン */}
      <button 
        className="btn"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        aria-expanded={isMenuOpen}
        aria-haspopup="true"
      >
        {user.photoURL ? (
          <img src={user.photoURL} alt={user.name || ''} width={24} height={24} />
        ) : (
          user.name?.charAt(0) || 'U'
        )}
      </button>

      {/* ドロップダウンメニュー */}
      {isMenuOpen && (
        <div className="dropdown__menu">
          <div>
            <div className="dropdown__user-name">{user.name}</div>
            <div>{roleDisplayNames[user.role] || user.role}</div>
          </div>
          <hr />
          
          {/* 管理者メニュー */}
          {user.role === 'admin' && (
            <>
              <Link 
                href="/admin/generate-article" 
                className="dropdown__item"
                onClick={() => setIsMenuOpen(false)}
              >
                管理パネル
              </Link>
              <hr />
            </>
          )}
          
          <button 
            className="dropdown__item"
            onClick={() => {
              setIsMenuOpen(false);
              signOut();
            }}
          >
            ログアウト
          </button>
        </div>
      )}
    </div>
  );
}
