import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * @file src/middleware.ts
 * @description CloudFront CachingDisabled 対象パスに Cache-Control: no-store を付与する。
 *              /admin/* の IP 制限は AWS WAF で実施するため、アプリ側では行わない。
 */

/**
 * キャッシュ無効化対象のパスプレフィックス
 * CloudFront Behavior の CachingDisabled 設定と一致させる
 */
const NO_CACHE_PREFIXES = ['/api/', '/admin/', '/auth/', '/withdraw/', '/payment/'];
const NO_CACHE_EXACT = ['/admin', '/auth', '/withdraw', '/payment'];

function shouldNoCache(pathname: string): boolean {
  return NO_CACHE_PREFIXES.some(p => pathname.startsWith(p))
    || NO_CACHE_EXACT.includes(pathname);
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  if (shouldNoCache(request.nextUrl.pathname)) {
    response.headers.set('Cache-Control', 'no-store, must-revalidate');
  }

  return response;
}

/**
 * ミドルウェアの適用範囲を指定する設定オブジェクト
 */
export const config = {
  /**
   * `matcher` プロパティにパスのパターンを指定することで、ミドルウェアが実行されるリクエストを限定します。
   * '/admin/:path*' は、以下の両方のパターンに一致します。
   * - /admin （ルート）
   * - /admin/articles, /admin/users/new のような任意のサブパス
   */
  matcher: [
    '/admin/:path*',
    '/api/:path*',
    '/auth/:path*',
    '/withdraw/:path*',
    '/payment/:path*',
  ],
};
