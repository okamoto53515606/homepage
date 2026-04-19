/**
 * サイト設定データモジュール
 *
 * DynamoDB の homepage-settings テーブル（PK: site_config）から
 * サイト全体のグローバル設定を取得・管理する。
 */

import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { getDocClient, Tables } from './dynamodb';
import { logger } from './env';

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
  copyright?: string;
  gtmId?: string;
}

/**
 * サイト設定を取得する
 */
export async function getSiteSettings(): Promise<SiteSettings | null> {
  try {
    const client = getDocClient();
    const result = await client.send(new GetCommand({
      TableName: Tables.settings,
      Key: { config_id: 'site_config' },
    }));

    if (!result.Item) {
      logger.warn('サイト設定 homepage-settings/site_config が見つかりません。');
      return null;
    }

    return result.Item as SiteSettings;
  } catch (error) {
    logger.error('サイト設定の取得に失敗しました:', error);
    return null;
  }
}
