/**
 * ヘッダーのクライアントコンポーネント
 * 
 * ハンバーガーメニューやログイン/ログアウトボタンなど、
 * インタラクティブなUI要素を担当します。
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/auth-provider';
import type { UserInfo } from '@/lib/auth';
import { Menu, X } from 'lucide-react';

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

  const roleDisplayNames: Record<string, string> = {
    guest: 'ゲスト',
    free_member: '無料会員',
    paid_member: '有料会員',
    admin: '管理者',
  };

  const getExpiryDate = () => {
    if (user?.role === 'paid_member' && user.accessExpiry) {
      return new Date(user.accessExpiry).toLocaleDateString('ja-JP');
    }
    return null;
  };
  const expiryDate = getExpiryDate();

  return (
    <div className="dropdown" ref={menuRef}>
      {/* ハンバーガーメニューボタン */}
      <button 
        className="btn-icon"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        aria-expanded={isMenuOpen}
        aria-haspopup="true"
        aria-label="メニューを開く"
      >
        {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* ドロップダウンメニュー */}
      {isMenuOpen && (
        <div className="dropdown__menu">
          {isLoggingIn ? (
            <div className="dropdown__item text-muted">ログイン中...</div>
          ) : user?.isLoggedIn ? (
            <>
              {/* ログイン済みユーザー情報 */}
              <div className="dropdown__user-info">
                <div className="dropdown__user-name">{user.name}</div>
                <div>{roleDisplayNames[user.role] || user.role}</div>
                {expiryDate && (
                  <div className="dropdown__expiry">有効期限: {expiryDate}</div>
                )}
              </div>
              
              {/* 管理者メニュー */}
              {user.role === 'admin' && (
                <Link 
                  href="/admin" 
                  className="dropdown__item"
                  onClick={() => setIsMenuOpen(false)}
                >
                  管理ダッシュボード
                </Link>
              )}
              {/* タグ一覧へのリンク（仮） */}
              <Link href="/" className="dropdown__item" onClick={() => setIsMenuOpen(false)}>
                タグ一覧
              </Link>
              <hr />
              <button 
                className="dropdown__item"
                onClick={() => {
                  setIsMenuOpen(false);
                  signOut();
                }}
              >
                ログアウト
              </button>
            </>
          ) : (
            <>
              {/* 未ログイン時 */}
              <button className="dropdown__item" onClick={signIn}>
                Googleでログイン
              </button>
              <hr />
              <Link href="/" className="dropdown__item" onClick={() => setIsMenuOpen(false)}>
                タグ一覧
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
