import Link from 'next/link';
import type { Metadata } from 'next';

/**
 * OAuth 認証エラー表示ページ
 *
 * Google OAuth のコールバック自体は /api/auth/google/callback で処理し、
 * 失敗時のみこのページにリダイレクトしてエラーを表示します。
 *
 * why (noindex):
 *   認証フローの途中 URL が検索結果に載るのは望ましくない（クエリに
 *   `error=` 等の状態が付き、クロールされるとログ・インデックスに残る）。
 *   robots.txt の `Disallow: /auth/` はクロール抑止であって索引抑止ではないため、
 *   noindex を併用して二重に塞ぐ。
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const message = (() => {
    switch (error) {
      case 'google_oauth_denied':
        return 'Google ログインがキャンセルされました。';
      case 'invalid_google_oauth_state':
        return 'ログイン状態の検証に失敗しました。もう一度お試しください。';
      case 'google_oauth_failed':
        return 'Google ログインに失敗しました。設定を確認して再試行してください。';
      default:
        return 'ログイン処理を完了できませんでした。';
    }
  })();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '1rem',
      }}
    >
      <p style={{ color: '#dc2626' }}>{message}</p>
      <Link href="/" style={{ color: '#2563eb' }}>
        トップページへ戻る
      </Link>
    </div>
  );
}
