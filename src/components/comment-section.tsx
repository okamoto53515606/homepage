/**
 * コメントセクションコンポーネント
 * 
 * 記事に対するコメントの一覧と投稿フォームを表示します。
 * コメント一覧とユーザー情報はクライアントで /api から取得します（CDN対応）。
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import type { UserInfo } from '@/lib/auth';
import { useAuth } from '@/components/auth/auth-provider';
import { fetchWithSigning } from '@/lib/fetch';
import { Loader2 } from 'lucide-react';
import { LoginModal } from './login-modal';


/** シリアライズ済みコメントの型 */
interface SerializableComment {
  id: string;
  articleId: string;
  content: string;
  userId: string;
  countryCode: string;
  region: string;
  dailyHashId: string;
  createdAt: string;
}


/**
 * タイムスタンプを読みやすい形式にフォーマットする
 * @param timestamp - サーバーから渡されるISO形式の文字列
 * @returns フォーマットされた日付文字列
 */
function formatTimestamp(timestamp: string | Date): string {
  try {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    return date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  } catch (e) {
    return '日付不明';
  }
}

/**
 * フォームの送信状態に応じて表示を切り替えるボタン
 */
function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <button type="submit" disabled={pending} className="btn">
      {pending ? (
        <>
          <Loader2 size={16} className="loading-spin" />
          <span>投稿中...</span>
        </>
      ) : (
        'コメントを投稿'
      )}
    </button>
  );
}

interface CommentSectionProps {
  /** 現在の記事ID */
  articleId: string;
  /** 記事のslug */
  slug: string;
  /** サイト名 */
  siteName: string;
  /** 利用規約のコンテンツ */
  termsOfServiceContent: string;
}

export default function CommentSection({ articleId, slug, siteName, termsOfServiceContent }: CommentSectionProps) {
  const { signIn, user: firebaseUser } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<{ status: string; message: string }>({ status: 'idle', message: '' });
  const [pending, setPending] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [comments, setComments] = useState<SerializableComment[]>([]);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // コメント一覧とユーザー情報をクライアントで取得
  useEffect(() => {
    async function fetchData() {
      try {
        const [commentsRes, userRes] = await Promise.all([
          fetch(`/api/articles/${slug}/comments`),
          fetch('/api/auth/me'),
        ]);
        const [commentsData, userData] = await Promise.all([
          commentsRes.json(),
          userRes.json(),
        ]);
        setComments(Array.isArray(commentsData) ? commentsData : []);
        setUser(userData);
      } catch {
        setComments([]);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [slug, firebaseUser]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setState({ status: 'idle', message: '' });

    const formData = new FormData(e.currentTarget);
    const content = formData.get('content') as string;

    try {
      const res = await fetchWithSigning(`/api/articles/${slug}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content, articleId }),
      });
      const data = await res.json();
      setState({ status: data.status, message: data.message });
      if (data.status === 'success') {
        formRef.current?.reset();
        // コメント一覧を再取得
        const commentsRes = await fetch(`/api/articles/${slug}/comments`);
        const commentsData = await commentsRes.json();
        setComments(Array.isArray(commentsData) ? commentsData : []);
      }
    } catch {
      setState({ status: 'error', message: 'コメントの投稿中にエラーが発生しました。' });
    } finally {
      setPending(false);
    }
  }

  if (isLoading) {
    return (
      <section>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <Loader2 size={24} className="loading-spin" />
        </div>
      </section>
    );
  }

  return (
    <section>
      {/* ヘッダー */}
      <div>
        <h2>コメント ({comments.length})</h2>
      </div>

      {/* コメント一覧 */}
      <div className="comment-list">
        {comments.map((comment) => (
          <div key={comment.id} className="comment">
            <div className="comment__header">
              <span>{comment.countryCode} / {comment.region} / ID:{comment.dailyHashId}</span>
              <span>{formatTimestamp(comment.createdAt)}</span>
            </div>
            <p style={{ whiteSpace: 'pre-wrap' }}>{comment.content}</p>
          </div>
        ))}
      </div>

      {/* コメント投稿フォーム */}
      <div className="comment-form">
        {user?.isLoggedIn ? (
          <form onSubmit={handleSubmit} ref={formRef}>
            <div className="form-group">
              <label htmlFor="commentContent" className="form-group__label">
                コメントを投稿
              </label>
              <textarea
                id="commentContent"
                name="content"
                className="form-group__textarea"
                rows={4}
                required
              />
            </div>
            <SubmitButton pending={pending} />
            {state.status === 'error' && <p className="error-text" style={{marginTop: '8px'}}>{state.message}</p>}
          </form>
        ) : (
          // 未ログイン時の表示
          <div className="form-card" style={{textAlign: 'center'}}>
            <p>コメントを投稿するにはログインが必要です。</p>
            <button onClick={() => setIsLoginModalOpen(true)} className="btn" style={{marginTop: '16px'}}>
              ログインしてコメントする
            </button>
            <LoginModal
              isOpen={isLoginModalOpen}
              onClose={() => setIsLoginModalOpen(false)}
              siteName={siteName}
              termsOfServiceContent={termsOfServiceContent}
            />
          </div>
        )}
      </div>
    </section>
  );
}
