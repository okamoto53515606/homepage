/**
 * 退会クライアントコンポーネント
 * 
 * 退会ボタンと確認モーダルを提供します。
 */
'use client';

import { useState } from 'react';
import { signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface WithdrawClientProps {
  userName: string;
}

export default function WithdrawClient({ userName }: WithdrawClientProps) {
  const [showModal, setShowModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleWithdrawClick = () => {
    setShowModal(true);
    setError(null);
  };

  const handleCancel = () => {
    setShowModal(false);
    setError(null);
  };

  const handleConfirm = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      // クライアントのFirebase Authからログアウト
      try {
        await firebaseSignOut(auth);
      } catch {
        // Firebase Authのログアウトに失敗しても続行
      }

      // サーバーサイドの退会処理を実行
      const response = await fetch('/api/auth/withdraw', {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '退会処理に失敗しました');
      }

      // 退会完了後、トップページにリダイレクト
      window.location.href = '/?withdrawn=true';

    } catch (err) {
      setError(err instanceof Error ? err.message : '退会処理に失敗しました');
      setIsProcessing(false);
    }
  };

  return (
    <>
      <div className="withdraw-action">
        <p>
          <strong>{userName}</strong> さん、上記の注意事項をご確認の上、退会を希望される場合は以下のボタンを押してください。
        </p>
        <button 
          onClick={handleWithdrawClick}
          className="withdraw-button"
          disabled={isProcessing}
        >
          退会する
        </button>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={handleCancel}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>⚠️ 本当に退会してもよろしいですか？</h3>
            
            <div className="modal-warning">
              <p>この操作は取り消すことができません。</p>
              <ul>
                <li>有料記事へのアクセス権は失われます</li>
                <li>お支払い済みの料金は返金されません</li>
                <li>アカウントの復元はできません</li>
              </ul>
            </div>

            {error && (
              <div className="modal-error">
                {error}
              </div>
            )}

            <div className="modal-actions">
              <button 
                onClick={handleCancel}
                className="cancel-button"
                disabled={isProcessing}
              >
                キャンセル
              </button>
              <button 
                onClick={handleConfirm}
                className="confirm-button"
                disabled={isProcessing}
              >
                {isProcessing ? '処理中...' : '退会を確定する'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .withdraw-action {
          padding: 1.5rem;
          background: #f8f9fa;
          border-radius: 8px;
        }
        .withdraw-action p {
          margin: 0 0 1rem 0;
        }
        .withdraw-button {
          background: #dc3545;
          color: white;
          border: none;
          padding: 0.75rem 2rem;
          border-radius: 4px;
          font-size: 1rem;
          cursor: pointer;
          transition: background 0.2s;
        }
        .withdraw-button:hover:not(:disabled) {
          background: #c82333;
        }
        .withdraw-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }
        .modal-content {
          background: white;
          border-radius: 8px;
          padding: 2rem;
          max-width: 450px;
          width: 100%;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }
        .modal-content h3 {
          margin: 0 0 1rem 0;
          color: #dc3545;
        }
        .modal-warning {
          background: #fff3cd;
          border: 1px solid #ffc107;
          border-radius: 4px;
          padding: 1rem;
          margin-bottom: 1rem;
        }
        .modal-warning p {
          margin: 0 0 0.5rem 0;
          font-weight: bold;
          color: #856404;
        }
        .modal-warning ul {
          margin: 0;
          padding-left: 1.5rem;
          color: #856404;
        }
        .modal-warning li {
          margin-bottom: 0.25rem;
        }
        .modal-error {
          background: #f8d7da;
          border: 1px solid #f5c6cb;
          border-radius: 4px;
          padding: 0.75rem;
          margin-bottom: 1rem;
          color: #721c24;
        }
        .modal-actions {
          display: flex;
          gap: 1rem;
          justify-content: flex-end;
        }
        .cancel-button {
          background: #6c757d;
          color: white;
          border: none;
          padding: 0.5rem 1.5rem;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .cancel-button:hover:not(:disabled) {
          background: #5a6268;
        }
        .confirm-button {
          background: #dc3545;
          color: white;
          border: none;
          padding: 0.5rem 1.5rem;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .confirm-button:hover:not(:disabled) {
          background: #c82333;
        }
        .cancel-button:disabled,
        .confirm-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </>
  );
}
