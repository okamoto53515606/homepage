/**
 * サイト設定フォーム（クライアントコンポーネント）
 * 
 * @description
 * useActionState を使用して、サーバーアクションの結果を非同期的、
 * かつインタラクティブに表示します。
 */
'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import type { SiteSettings } from '@/lib/settings';
import { updateSettingsAction, type SettingsFormState } from './actions';
import { Loader2 } from 'lucide-react';

/**
 * 送信ボタンコンポーネント
 * useFormStatus を使って、フォームの送信状態に応じて表示を切り替えます。
 */
function SubmitButton() {
  const { pending } = useFormStatus();

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
  const initialState: SettingsFormState = { status: 'idle', message: '' };
  const [state, formAction] = useActionState(updateSettingsAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // サーバーアクションの完了後、フォームの状態をリセット
  useEffect(() => {
    if (state.status === 'success') {
      // 成功メッセージを3秒表示
      const timer = setTimeout(() => {
        state.status = 'idle';
        state.message = '';
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  // デフォルト値が null の場合のフォールバック
  const settings = initialSettings || {};

  return (
    <form action={formAction} ref={formRef}>
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

      <SubmitButton />
    </form>
  );
}
