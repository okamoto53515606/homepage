/**
 * ヘッダーのクライアントコンポーネント
 * 
 * ユーザー情報を /api/auth/me から取得し、
 * ログイン/ログアウトボタンやドロップダウンメニューなど、
 * インタラクティブなUI要素を担当します。
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import type { UserInfo } from '@/lib/auth';
import Link from 'next/link';
import { LogOut, Crown, User, Loader, UserX } from 'lucide-react';
import { LoginModal } from './login-modal';

interface HeaderUserSectionProps {
  /** サイト名 */
  siteName: string;
  /** 利用規約のコンテンツ */
  termsOfServiceContent: string;
}

/**
 * ヘッダーのユーザー関連セクション
 * /api/auth/me からユーザー情報を取得し、UserStatus と UserProfileClient を描画
 */
export function HeaderUserSection({ siteName, termsOfServiceContent }: HeaderUserSectionProps) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isFetched, setIsFetched] = useState(false);
  const { user: authUser, isLoggingIn } = useAuth();

  // 初回マウント時 + 認証状態変更時にユーザー情報を取得
  useEffect(() => {
    // 認証の初期化完了を待つ
    if (isLoggingIn) return;

    async function fetchUser() {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        setUser(data);
      } catch {
        setUser(null);
      } finally {
        setIsFetched(true);
      }
    }
    fetchUser();
  }, [authUser, isLoggingIn]);

  return (
    <>
      <UserStatus user={user} />
      <div className="header__right">
        <UserProfileClient
          user={user}
          isFetched={isFetched}
          siteName={siteName}
          termsOfServiceContent={termsOfServiceContent}
        />
      </div>
    </>
  );
}

/**
 * ユーザーの有効期限表示
 */
function UserStatus({ user }: { user: UserInfo | null }) {
  if (user?.accessExpiry && new Date(user.accessExpiry) > new Date()) {
    const expiryDate = new Date(user.accessExpiry).toLocaleDateString('ja-JP');
    return (
      <div className="header__center">
        <span className="header__expiry-label">有料会員期限</span>
        <span className="header__expiry-date">{expiryDate}</span>
      </div>
    );
  }
  return <div className="header__center"></div>;
}

interface UserProfileClientProps {
  /** ユーザー情報 */
  user: UserInfo | null;
  /** サイト名 */
  siteName: string;
  /** 利用規約のコンテンツ */
  termsOfServiceContent: string;
}

function UserProfileClient({ user, isFetched, siteName, termsOfServiceContent }: UserProfileClientProps & { isFetched: boolean }) {
  const { signIn, signOut, isLoggingIn } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
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

  if (isLoggingIn || !isFetched) {
    return (
      <div className="btn-icon">
        <Loader size={28} className="loading-spinner" />
      </div>
    );
  }

  if (!user?.isLoggedIn) {
    return (
      <>
        <button onClick={() => setIsLoginModalOpen(true)} className="btn">
          <span>Googleでログイン</span>
        </button>
        <LoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          siteName={siteName}
          termsOfServiceContent={termsOfServiceContent}
        />
      </>
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
          <hr />
          <Link
            href="/withdraw"
            className="dropdown__item dropdown__item--danger"
            onClick={() => setIsMenuOpen(false)}
          >
            <UserX size={16} style={{marginRight: '8px'}} />
            退会
          </Link>
        </div>
      )}
    </div>
  );
}
