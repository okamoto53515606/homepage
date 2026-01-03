/**
 * 環境ユーティリティ
 * 
 * 本番環境判定、ロギング、IPアドレス取得などの共通機能を提供します。
 */

import { headers } from 'next/headers';

/**
 * 本番環境かどうかを判定
 * @returns true: 本番環境, false: 開発環境
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

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
