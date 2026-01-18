/**
 * 管理画面アクセス拒否ページ
 *
 * @description
 * IPアドレス制限により管理画面へのアクセスがブロックされた場合に
 * 表示される静的なページコンポーネントです。
 * Next.jsのミドルウェア（src/middleware.ts）からリダイレクトされます。
 *
 * @returns {JSX.Element} アクセスが拒否されたことを示すUIコンポーネント
 */
import { ShieldAlert } from 'lucide-react';

export default function AdminForbiddenPage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 'calc(100vh - 200px)', // フッターなどを考慮した画面の高さ調整
      textAlign: 'center',
      padding: '2rem',
    }}>
      <ShieldAlert size={64} style={{ color: '#dc3545', marginBottom: '1.5rem' }} />
      <h1 style={{
        fontSize: '2rem',
        fontWeight: 'bold',
        marginBottom: '1rem',
      }}>
        アクセスが拒否されました
      </h1>
      <p style={{
        fontSize: '1.1rem',
        color: '#6c757d',
        maxWidth: '500px',
      }}>
        このページへのアクセスは、許可されたIPアドレスからのみに制限されています。
        <br />
        アクセス権についてご不明な点がある場合は、管理者にお問い合わせください。
      </p>
    </div>
  );
}
