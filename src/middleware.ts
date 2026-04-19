import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * @file src/middleware.ts
 * @description Next.jsのミドルウェア機能を利用して、特定パスへのアクセスを制御します。
 *              このファイルでは、管理画面（/admin/*）へのアクセスをIPアドレスに基づいて制限するロジックを実装しています。
 */

/**
 * ミドルウェア関数
 * 
 * @description
 * リクエスト毎に実行され、指定された条件に基づいてアクセスを許可または拒否します。
 * 
 * @param {NextRequest} request - 受信したリクエストオブジェクト
 * @returns {NextResponse} 次の処理へ進むためのレスポンス、またはリダイレクトレスポンス
 */
/**
 * リクエストヘッダーからクライアントIPアドレスを取得
 * CloudFront: CloudFront-Viewer-Address (ip:port 形式)
 */
function getClientIpFromHeaders(headers: Headers): string {
  const viewerAddress = headers.get('cloudfront-viewer-address');
  if (viewerAddress) {
    // "ip:port" 形式からIPだけ取得
    const lastColon = viewerAddress.lastIndexOf(':');
    return lastColon > 0 ? viewerAddress.substring(0, lastColon) : viewerAddress;
  }

  return '0.0.0.0';
}

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
  const pathname = request.nextUrl.pathname;

  // --- キャッシュ制御: CloudFront CachingDisabled 対象パスに no-store を付与 ---
  // /api/*, /admin/*, /auth/*, /withdraw/*, /payment/* はキャッシュしない
  const noCachePaths = shouldNoCache(pathname);

  // ログインページ・forbiddenページはIP制限対象外
  if (pathname === '/admin/login' || pathname === '/admin/forbidden') {
    const response = NextResponse.next();
    if (noCachePaths) {
      response.headers.set('Cache-Control', 'no-store, must-revalidate');
    }
    return response;
  }

  // /admin/* 以外のパスはIP制限不要 → キャッシュ制御のみ
  if (!pathname.startsWith('/admin')) {
    const response = NextResponse.next();
    if (noCachePaths) {
      response.headers.set('Cache-Control', 'no-store, must-revalidate');
    }
    return response;
  }

  // --- ステップ1: 環境変数から許可IPアドレスのリストを取得 ---
  // ALLOWED_IP_ADDRESSES_FOR_THE_ADMIN_PAGE="xxx.xxx.xxx.xxx yyy.yyy.yyy.yyy" のような形式を想定
  const allowedIpsString = process.env.ALLOWED_IP_ADDRESSES_FOR_THE_ADMIN_PAGE;

  // --- ステップ2: IP制限の要否を判断 ---
  // 環境変数が設定されていない、または値が空の文字列の場合は、IP制限を適用せず、全てのアクセスを許可します。
  // これにより、開発環境やIP制限が不要な場合に、この機能を簡単に無効化できます。
  if (!allowedIpsString) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-store, must-revalidate');
    return response;
  }

  // 環境変数の値をスペースで分割し、IPアドレスの配列を生成します。
  // `filter` を使って、連続したスペースなどによって生まれる空の要素を取り除きます。
  const allowedIps = allowedIpsString.split(' ').filter(ip => ip.trim() !== '');

  // 空白文字のみが設定されているようなケースを考慮し、有効なIPが1つもなければ制限を行いません。
  if (allowedIps.length === 0) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-store, must-revalidate');
    return response;
  }

  // --- ステップ3: アクセス元IPアドレスの特定 ---
  // CloudFront環境では 'CloudFront-Viewer-Address' ヘッダーからクライアントIPを取得します。
  const requestIp = getClientIpFromHeaders(request.headers);


  // --- ステップ4: アクセス許可の検証 ---
  // 取得したアクセス元IPが、許可IPリストに含まれているかを確認します。
  if (requestIp && allowedIps.includes(requestIp)) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-store, must-revalidate');
    return response;
  }

  // --- ステップ5: アクセス拒否処理 ---
  // 許可されていないIPアドレスからのアクセスであるため、アクセス拒否ページにリダイレクトします。
  const forbiddenUrl = new URL('/admin/forbidden', request.url);

  // 無限リダイレクトループを防ぐための重要なチェックです。
  // 現在のリクエストパスが、リダイレクト先のパスと同じでないことを確認します。
  // これがないと、/admin/forbidden にリダイレクト → ミドルウェアが再実行 → /admin/forbidden にリダイレクト... と繰り返してしまいます。
  if (request.nextUrl.pathname !== forbiddenUrl.pathname) {
    return NextResponse.redirect(forbiddenUrl);
  }

  // アクセス先がすでに拒否ページの場合は、そのまま表示を許可します。
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store, must-revalidate');
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
