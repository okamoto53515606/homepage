/**
 * サイト設定ページ（管理画面）
 * 
 * @description
 * サイト全体のグローバルな設定を管理します。
 * Firestoreの /settings/site_config ドキュメントを操作します。
 */

import { getSiteSettings } from '@/lib/settings';
import SettingsForm from './settings-form';

export default async function SettingsPage() {
  // サーバーサイドで設定データを取得
  const settings = await getSiteSettings();

  return (
    <>
      <header className="admin-page-header">
        <h1>サイト設定</h1>
        <p>サイト名、課金設定、法務関連ページなどを管理します。</p>
      </header>
      
      <div className="admin-card">
        {/*
          フォーム部分はクライアントコンポーネントに分離し、
          useFormStateフックを使用してインタラクティブなフィードバックを提供します。
        */}
        <SettingsForm initialSettings={settings} />
      </div>
    </>
  );
}
