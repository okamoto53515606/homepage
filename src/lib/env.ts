/**
 * 環境ユーティリティ
 * 
 * 本番環境判定、ロギング、IPアドレス取得などの共通機能を提供します。
 */

import { headers } from 'next/headers';

/**
 * 開発環境かどうかを判定
 * @returns true: 開発環境, false: 本番環境
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * 本番環境では出力しないログ関数
 * 開発環境のみでデバッグログを出力します。
 */
export const logger = {
  /**
   * デバッグログ（開発環境のみ出力）
   */
  debug: (...args: unknown[]) => {
    if (isDevelopment()) {
      console.log(...args);
    }
  },

  /**
   * 情報ログ（開発環境のみ出力）
   */
  info: (...args: unknown[]) => {
    if (isDevelopment()) {
      console.log(...args);
    }
  },

  /**
   * 警告ログ（常に出力）
   */
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },

  /**
   * エラーログ（常に出力）
   */
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};

/**
 * クライアントのIPアドレスを取得（サーバーサイド専用）
 * 
 * - Firebase App Hosting環境: 'x-fah-client-ip' ヘッダーを使用
 * - 開発環境など: '0.0.0.0' を返す
 * 
 * @returns クライアントIPアドレス
 */
export async function getClientIp(): Promise<string> {
  const headersList = await headers();
  return headersList.get('x-fah-client-ip') || '0.0.0.0';
}

/**
 * リクエスト情報（IP + UserAgent）を取得（サーバーサイド専用）
 * 
 * @returns IPアドレスとUserAgent
 */
export async function getRequestInfo(): Promise<{ ip: string; userAgent: string }> {
  const headersList = await headers();
  const ip = headersList.get('x-fah-client-ip') || '0.0.0.0';
  const userAgent = headersList.get('user-agent') || 'N/A';
  return { ip, userAgent };
}

/**
 * セッション有効期間を取得（時間単位）
 * 
 * 環境変数 SESSION_DURATION_HOURS から取得します。
 * 未設定の場合は120時間（5日間）をデフォルトとします。
 * 
 * Firebase Admin SDKのcreateSessionCookieは最大2週間（336時間）まで対応。
 * 
 * @returns セッション有効期間（時間）
 */
export function getSessionDurationHours(): number {
  const envValue = process.env.SESSION_DURATION_HOURS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 336) {
      return parsed;
    }
    logger.warn(`[env] SESSION_DURATION_HOURS の値が不正です: ${envValue}（1〜336の範囲で指定してください）`);
  }
  return 120; // デフォルト: 5日間 = 120時間
}
