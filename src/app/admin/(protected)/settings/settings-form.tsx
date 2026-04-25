/**
 * サイト設定フォーム（クライアントコンポーネント）
 * 
 * @description
 * API Route を呼び出してサイト設定を更新します。
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import type { SiteSettings } from '@/lib/settings';
import { fetchWithSigning } from '@/lib/fetch';
import { Loader2 } from 'lucide-react';

/**
 * 送信ボタンコンポーネント
 */
function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
      {pending ? (
        <>
          <Loader2 size={16} className="loading-spin" />
          <span>保存中...</span>
        </>
      ) : (
        '設定を保存'
      )}
    </button>
  );
}

interface SettingsFormProps {
  initialSettings: SiteSettings | null;
}

export default function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [state, setState] = useState<{ status: string; message: string }>({ status: 'idle', message: '' });
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // 成功メッセージを3秒で消す
  useEffect(() => {
    if (state.status === 'success') {
      const timer = setTimeout(() => {
        setState({ status: 'idle', message: '' });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setState({ status: 'idle', message: '' });

    const formData = new FormData(e.currentTarget);
    const body = {
      siteName: formData.get('siteName'),
      paymentAmount: formData.get('paymentAmount'),
      accessDurationDays: formData.get('accessDurationDays'),
      metaTitle: formData.get('metaTitle'),
      metaDescription: formData.get('metaDescription'),
      legalCommerceContent: formData.get('legalCommerceContent'),
      privacyPolicyContent: formData.get('privacyPolicyContent'),
      termsOfServiceContent: formData.get('termsOfServiceContent'),
      copyright: formData.get('copyright'),
      gtmId: formData.get('gtmId') || '',
    };

    try {
      const res = await fetchWithSigning('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setState({ status: data.status, message: data.message });
    } catch {
      setState({ status: 'error', message: 'サーバーエラーが発生しました。設定の保存に失敗しました。' });
    } finally {
      setPending(false);
    }
  }

  // デフォルト値が null の場合のフォールバック
  const settings = initialSettings || {};

  return (
    <form onSubmit={handleSubmit} ref={formRef}>
      {/* フォーム送信結果の通知 */}
      {state.message && (
        <div 
          className={`admin-notice ${state.status === 'success' ? 'admin-notice--success' : 'admin-notice--error'}`}
          style={{ marginBottom: '1.5rem' }}
        >
          <p>{state.message}</p>
        </div>
      )}

      {/* --- 基本設定 --- */}
      <div className="admin-form-group">
        <label htmlFor="siteName">サイト名</label>
        <input type="text" id="siteName" name="siteName" className="admin-input" defaultValue={settings.siteName} />
        <small>サイトのヘッダーなどに表示されます。</small>
      </div>
      
      <div className="admin-form-group">
        <label htmlFor="paymentAmount">課金金額 (円)</label>
        <input type="number" id="paymentAmount" name="paymentAmount" className="admin-input" defaultValue={settings.paymentAmount} />
        <small>Stripeで決済される金額です。</small>
      </div>

      <div className="admin-form-group">
        <label htmlFor="accessDurationDays">アクセス有効日数 (日)</label>
        <input type="number" id="accessDurationDays" name="accessDurationDays" className="admin-input" defaultValue={settings.accessDurationDays} />
        <small>一度の課金で有料記事を閲覧できる日数です。</small>
      </div>

      <hr style={{margin: '2rem 0'}}/>

      {/* --- SEO設定 --- */}
      <div className="admin-form-group">
        <label htmlFor="metaTitle">トップページのmeta title</label>
        <input type="text" id="metaTitle" name="metaTitle" className="admin-input" defaultValue={settings.metaTitle} />
      </div>

      <div className="admin-form-group">
        <label htmlFor="metaDescription">トップページのmeta description</label>
        <textarea id="metaDescription" name="metaDescription" className="admin-textarea" rows={2} defaultValue={settings.metaDescription}></textarea>
      </div>
      
      <hr style={{margin: '2rem 0'}}/>
      
      {/* --- 法務ページ設定 --- */}
      <div className="admin-form-group">
        <label htmlFor="legalCommerceContent">特定商取引法に基づく表記</label>
        <textarea id="legalCommerceContent" name="legalCommerceContent" className="admin-textarea" rows={10} defaultValue={settings.legalCommerceContent}></textarea>
      </div>
      
      <div className="admin-form-group">
        <label htmlFor="privacyPolicyContent">プライバシーポリシー</label>
        <textarea id="privacyPolicyContent" name="privacyPolicyContent" className="admin-textarea" rows={10} defaultValue={settings.privacyPolicyContent}></textarea>
      </div>

      <div className="admin-form-group">
        <label htmlFor="termsOfServiceContent">利用規約</label>
        <textarea id="termsOfServiceContent" name="termsOfServiceContent" className="admin-textarea" rows={10} defaultValue={settings.termsOfServiceContent}></textarea>
      </div>

      <hr style={{margin: '2rem 0'}}/>

      {/* --- フッター設定 --- */}
      <div className="admin-form-group">
        <label htmlFor="copyright">フッターのコピーライト</label>
        <input type="text" id="copyright" name="copyright" className="admin-input" defaultValue={settings.copyright} />
        <small>例: © 2024 My Homepage. All Rights Reserved.</small>
      </div>

      <hr style={{margin: '2rem 0'}}/>

      {/* --- GTM (Google Tag Manager) 設定 --- */}
      <div className="admin-form-group">
        <label htmlFor="gtmId">Google Tag Manager ID</label>
        <input type="text" id="gtmId" name="gtmId" className="admin-input" defaultValue={settings.gtmId} placeholder="GTM-XXXXXXX" />
        <small>GTMの管理画面で確認できるコンテナIDを入力してください（例: GTM-XXXXXXX）。空欄の場合、GTMは無効になります。</small>
      </div>


      <SubmitButton pending={pending} />
    </form>
  );
}
