'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchWithSigning } from '@/lib/fetch';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Stripe 設定の処理に失敗しました';
}

interface StripeConfigState {
  secretKey: string;
  webhookSecret: string;
  taxRates: string;
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
        'Stripe 設定を保存'
      )}
    </button>
  );
}

export default function StripeConfigForm() {
  const [config, setConfig] = useState<StripeConfigState>({
    secretKey: '',
    webhookSecret: '',
    taxRates: '',
  });
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ status: 'idle' | 'success' | 'error'; text: string }>({
    status: 'idle',
    text: '',
  });

  useEffect(() => {
    async function loadConfig() {
      try {
        const response = await fetch('/api/admin/stripe-config');
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Stripe 設定の取得に失敗しました');
        }

        setConfig({
          secretKey: '',
          webhookSecret: '',
          taxRates: data.taxRates || '',
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
      const response = await fetchWithSigning('/api/admin/stripe-config', {
        method: 'POST',
        body: JSON.stringify({
          secretKey: config.secretKey,
          webhookSecret: config.webhookSecret,
          taxRates: config.taxRates,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Stripe 設定の保存に失敗しました');
      }

      setConfig(current => ({ ...current, secretKey: '', webhookSecret: '' }));
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
        <h2 style={{ marginBottom: '0.5rem' }}>Stripe 設定</h2>
        <p>決済に使う Stripe シークレットキー・Webhook シークレットを管理します。</p>
      </header>

      {message.text && (
        <div
          className={`admin-notice ${message.status === 'success' ? 'admin-notice--success' : 'admin-notice--error'}`}
          style={{ marginBottom: '1rem' }}
        >
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
            <label htmlFor="stripeSecretKey">Stripe シークレットキー</label>
            <input
              id="stripeSecretKey"
              name="stripeSecretKey"
              type="password"
              className="admin-input"
              value={config.secretKey}
              onChange={event => setConfig(current => ({ ...current, secretKey: event.target.value }))}
              placeholder="sk_live_... または sk_test_..."
              required
            />
            <small>GET API では秘密値を返さないため、更新時は再入力してください。</small>
          </div>

          <div className="admin-form-group">
            <label htmlFor="stripeWebhookSecret">Stripe Webhook シークレット</label>
            <input
              id="stripeWebhookSecret"
              name="stripeWebhookSecret"
              type="password"
              className="admin-input"
              value={config.webhookSecret}
              onChange={event => setConfig(current => ({ ...current, webhookSecret: event.target.value }))}
              placeholder="whsec_..."
              required
            />
            <small>GET API では秘密値を返さないため、更新時は再入力してください。</small>
          </div>

          <div className="admin-form-group">
            <label htmlFor="stripeTaxRates">消費税率 ID（省略可）</label>
            <input
              id="stripeTaxRates"
              name="stripeTaxRates"
              type="text"
              className="admin-input"
              value={config.taxRates}
              onChange={event => setConfig(current => ({ ...current, taxRates: event.target.value }))}
              placeholder="txr_..."
            />
            <small>Stripe ダッシュボードで作成した Tax Rate ID を入力します。空欄の場合は消費税なし。</small>
          </div>

          <SubmitButton pending={pending} />
        </form>
      )}
    </section>
  );
}
