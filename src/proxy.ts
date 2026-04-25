import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * @file src/proxy.ts
 * @description CloudFront CachingDisabled 対象パスに Cache-Control: no-store を付与する。
 *              /admin/* の IP 制限は AWS WAF で実施するため、アプリ側では行わない。
 */

const NO_CACHE_PREFIXES = ['/api/', '/admin/', '/auth/', '/withdraw/', '/payment/'];
const NO_CACHE_EXACT = ['/admin', '/auth', '/withdraw', '/payment'];

function shouldNoCache(pathname: string): boolean {
  return NO_CACHE_PREFIXES.some(prefix => pathname.startsWith(prefix)) || NO_CACHE_EXACT.includes(pathname);
}

export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  if (shouldNoCache(request.nextUrl.pathname)) {
    response.headers.set('Cache-Control', 'no-store, must-revalidate');
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*', '/auth/:path*', '/withdraw/:path*', '/payment/:path*'],
};
