import Link from 'next/link';

/**
 * OAuth 認証エラー表示ページ
 *
 * Google OAuth のコールバック自体は /api/auth/google/callback で処理し、
 * 失敗時のみこのページにリダイレクトしてエラーを表示します。
 */
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
