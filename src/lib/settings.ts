/**
 * サイト設定データモジュール
 * 
 * @description
 * Firestoreの `/settings/site_config` ドキュメントから
 * サイト全体のグローバル設定を取得・管理します。
 */

import { getAdminDb } from './firebase-admin';

// SiteSettings の型定義
export interface SiteSettings {
  siteName?: string;
  paymentAmount?: number;
  accessDurationDays?: number;
  metaTitle?: string;
  metaDescription?: string;
  legalCommerceContent?: string;
  privacyPolicyContent?: string;
  termsOfServiceContent?: string;
}

/**
 * サイト設定を取得する
 * 
 * @returns {Promise<SiteSettings | null>} サイト設定オブジェクト。ドキュメントが存在しない場合は null。
 */
export async function getSiteSettings(): Promise<SiteSettings | null> {
  try {
    const db = getAdminDb();
    const docRef = db.collection('settings').doc('site_config');
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      console.warn('サイト設定ドキュメント /settings/site_config が見つかりません。');
      return null;
    }
    
    return docSnap.data() as SiteSettings;

  } catch (error) {
    console.error('サイト設定の取得に失敗しました:', error);
    return null;
  }
}
