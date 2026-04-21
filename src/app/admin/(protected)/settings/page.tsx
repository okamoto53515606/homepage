/**
 * サイト設定ページ（管理画面）
 *
 * @description
 * サイト全体のグローバルな設定を管理します。
 */

import { getSiteSettings } from '@/lib/settings';
import GoogleOAuthForm from './google-oauth-form';
import SettingsForm from './settings-form';
import StripeConfigForm from './stripe-config-form';

export default async function SettingsPage() {
  const settingsData = await getSiteSettings();

  const initialSettings = settingsData;

  return (
    <>
      <header className="admin-page-header">
        <h1>サイト設定</h1>
        <p>サイト名、課金設定、法務関連ページなどを管理します。</p>
      </header>

      <div className="admin-card">
        <SettingsForm initialSettings={initialSettings} />
      </div>

      <div className="admin-card" style={{ marginTop: '2rem' }}>
        <GoogleOAuthForm />
      </div>

      <div className="admin-card" style={{ marginTop: '2rem' }}>
        <StripeConfigForm />
      </div>
    </>
  );
}
