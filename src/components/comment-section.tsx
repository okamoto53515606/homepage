/**
 * コメントセクションコンポーネント
 * 
 * 記事に対するコメントの一覧と投稿フォームを表示します。
 * 現在はプロトタイプのため、投稿機能は実装されていません。
 */
'use client';

import { useState } from 'react';
import type { Comment } from '@/lib/data';

interface CommentSectionProps {
  /** 表示するコメント一覧 */
  comments: Comment[];
}

export default function CommentSection({ comments }: CommentSectionProps) {
  const [newComment, setNewComment] = useState('');

  /**
   * コメント投稿ハンドラー（未実装）
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: コメント投稿機能を実装
    console.log('Comment submitted:', newComment);
    setNewComment('');
  };

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
              <span>{comment.location}</span>
              <span>{comment.timestamp}</span>
            </div>
            <p>{comment.text}</p>
          </div>
        ))}
      </div>

      {/* コメント投稿フォーム */}
      <form className="comment-form" onSubmit={handleSubmit}>
        <textarea
          className="comment-form__textarea"
          placeholder="コメントを入力..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
        />
        <button type="submit" className="comment-form__submit">
          コメントを投稿
        </button>
      </form>
    </section>
  );
}
