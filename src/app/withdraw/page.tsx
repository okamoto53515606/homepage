/**
 * 退会（アカウント削除）ページ
 * 
 * ユーザーが自身のアカウントを削除するためのページです。
 * ログインしていない場合はトップページにリダイレクトします。
 */

import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { getSiteSettings } from '@/lib/settings';
import type { Metadata } from 'next';
import WithdrawClient from './withdraw-client';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const siteName = settings?.siteName || '';
  return {
    title: `退会 | ${siteName}`,
    description: 'アカウントの退会手続きを行います',
  };
}

export default async function WithdrawPage() {
  const user = await getUser();

  // 未ログインの場合はトップページにリダイレクト
  if (!user.isLoggedIn) {
    redirect('/');
  }

  return (
    <main className="withdraw-page">
      <h1>退会（アカウント削除）</h1>
      
      <div className="withdraw-warning">
        <h2>⚠️ 退会前にご確認ください</h2>
        
        <ul>
          <li>
            <strong>有料記事について：</strong>
            購入済みであっても、退会後は有料記事を閲覧できなくなります。
          </li>
          <li>
            <strong>返金について：</strong>
            退会しても、お支払い済みの料金の返金はできません。
          </li>
          <li>
            <strong>コメントについて：</strong>
            投稿したコメントはサイト上に残ります。
          </li>
          <li>
            <strong>復元について：</strong>
            退会後のアカウント復元はできません。
          </li>
        </ul>
      </div>

      <WithdrawClient userName={user.name || user.email || 'ユーザー'} />

      <style>{`
        .withdraw-page {
          max-width: 600px;
          margin: 2rem auto;
          padding: 0 1rem;
        }
        .withdraw-page h1 {
          margin-bottom: 1.5rem;
        }
        .withdraw-warning {
          background: #fff3cd;
          border: 1px solid #ffc107;
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 2rem;
        }
        .withdraw-warning h2 {
          margin: 0 0 1rem 0;
          font-size: 1.1rem;
          color: #856404;
        }
        .withdraw-warning ul {
          margin: 0;
          padding-left: 1.5rem;
        }
        .withdraw-warning li {
          margin-bottom: 0.75rem;
          color: #856404;
        }
        .withdraw-warning li:last-child {
          margin-bottom: 0;
        }
      `}</style>
    </main>
  );
}
