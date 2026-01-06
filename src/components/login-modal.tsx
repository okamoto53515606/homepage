/**
 * ログイン確認モーダルコンポーネント
 * 
 * ログインボタンを押した時に表示されるモーダルダイアログ。
 * 利用規約を表示し、同意の上でGoogleログインを実行します。
 */
'use client';

import { useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/components/auth/auth-provider';

interface LoginModalProps {
  /** モーダルが開いているかどうか */
  isOpen: boolean;
  /** モーダルを閉じる関数 */
  onClose: () => void;
  /** サイト名 */
  siteName: string;
  /** 利用規約のコンテンツ */
  termsOfServiceContent: string;
}

/**
 * Markdown記法を除去してプレーンテキストに変換
 */
function stripMarkdown(text: string): string {
  return text
    // 見出し（## や ###）を除去
    .replace(/^#{1,6}\s+/gm, '')
    // リスト記号（- ）を除去
    .replace(/^-\s+/gm, '・')
    // 水平線（---）を除去
    .replace(/^---+$/gm, '')
    // リンク記法 [text](url) をテキストのみに
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // 太字・斜体を除去
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    // 連続空行を1つに
    .replace(/\n{3,}/g, '\n\n');
}

export function LoginModal({ isOpen, onClose, siteName, termsOfServiceContent }: LoginModalProps) {
  const { signIn } = useAuth();

  // Markdown記法を除去したプレーンテキスト
  const plainTerms = useMemo(() => stripMarkdown(termsOfServiceContent), [termsOfServiceContent]);

  // ESCキーでモーダルを閉じる
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // スクロールを無効化
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  // 背景クリックでモーダルを閉じる
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  // ログイン実行
  const handleLogin = () => {
    onClose();
    signIn();
  };

  if (!isOpen) return null;

  return (
    <div className="login-modal-backdrop" onClick={handleBackdropClick}>
      <div className="login-modal">
        <h2 className="login-modal__title">{siteName} へようこそ</h2>
        
        <div className="login-modal__terms-box">
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
            {plainTerms}
          </pre>
        </div>
        
        <p className="login-modal__notice">
          ログインすることで、上記の利用規約に同意したものとみなされます。
        </p>
        
        <button onClick={handleLogin} className="btn btn--primary btn--full">
          Googleでログイン
        </button>
        
        <button onClick={onClose} className="login-modal__close-btn">
          閉じる
        </button>
      </div>
    </div>
  );
}
