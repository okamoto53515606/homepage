'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchWithSigning } from '@/lib/fetch';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Google OAuth 設定の処理に失敗しました';
}

interface GoogleOAuthConfigState {
  clientId: string;
  clientSecret: string;
  source?: string;
}

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
      {pending ? (
        <>
          <Loader2 size={16} className="loading-spin" />
          <span>保存中...</span>
        </>
      ) : (
        'Google OAuth 設定を保存'
      )}
    </button>
  );
}

export default function GoogleOAuthForm() {
  const [config, setConfig] = useState<GoogleOAuthConfigState>({ clientId: '', clientSecret: '' });
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ status: 'idle' | 'success' | 'error'; text: string }>({
    status: 'idle',
    text: '',
  });

  useEffect(() => {
    async function loadConfig() {
      try {
        const response = await fetch('/api/admin/google-oauth-config');
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Google OAuth 設定の取得に失敗しました');
        }

        setConfig({
          clientId: data.clientId || '',
          clientSecret: '',
          source: data.source,
        });
      } catch (error: unknown) {
        setMessage({ status: 'error', text: getErrorMessage(error) });
      } finally {
        setLoading(false);
      }
    }

    loadConfig();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage({ status: 'idle', text: '' });

    try {
      const response = await fetchWithSigning('/api/admin/google-oauth-config', {
        method: 'POST',
        body: JSON.stringify({
          clientId: config.clientId,
          clientSecret: config.clientSecret,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Google OAuth 設定の保存に失敗しました');
      }

      setConfig(current => ({ ...current, clientSecret: '' }));
      setMessage({ status: 'success', text: data.message || '設定を保存しました' });
    } catch (error: unknown) {
      setMessage({ status: 'error', text: getErrorMessage(error) });
    } finally {
      setPending(false);
    }
  }

  return (
    <section>
      <header style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>Google OAuth 設定</h2>
        <p>利用者向け Google ログインで使う Client ID / Client Secret を管理します。</p>
      </header>

      {message.text && (
        <div className={`admin-notice ${message.status === 'success' ? 'admin-notice--success' : 'admin-notice--error'}`} style={{ marginBottom: '1rem' }}>
          <p>{message.text}</p>
        </div>
      )}

      {loading ? (
        <p>設定を読み込み中...</p>
      ) : config.source === 'env' ? (
        <div className="admin-notice" style={{ marginBottom: '1rem' }}>
          <p>ローカル環境では <code>.env</code> ファイルを直接編集してください。このフォームから保存することはできません。</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="admin-form-group">
            <label htmlFor="googleClientId">Google OAuth Client ID</label>
            <input
              id="googleClientId"
              name="googleClientId"
              type="text"
              className="admin-input"
              value={config.clientId}
              onChange={event => setConfig(current => ({ ...current, clientId: event.target.value }))}
              required
            />
          </div>

          <div className="admin-form-group">
            <label htmlFor="googleClientSecret">Google OAuth Client Secret</label>
            <input
              id="googleClientSecret"
              name="googleClientSecret"
              type="text"
              className="admin-input"
              value={config.clientSecret}
              onChange={event => setConfig(current => ({ ...current, clientSecret: event.target.value }))}
              placeholder="現在の値を更新する場合のみ入力"
              required
            />
            <small>GET API では秘密値を返さないため、更新時は再入力してください。</small>
          </div>

          {config.source && config.source !== 'env' && (
            <p style={{ marginBottom: '1rem' }}>取得元: {config.source}</p>
          )}

          <SubmitButton pending={pending} />
        </form>
      )}
    </section>
  );
}
