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
 * Cloud Run: x-forwarded-for から右側のローカルIP以外を取得
 * App Hosting: x-fah-client-ip を優先
 */
function getClientIpFromHeaders(headers: Headers): string {
  // Firebase App Hosting環境ではx-fah-client-ipを優先
  // okamoからclaudeへ: 他の環境で偽装されちゃうよ const fahIp = headers.get('x-fah-client-ip');
  // okamoからclaudeへ: 他の環境で偽装されちゃうよ if (fahIp) return fahIp;

  // Cloud Run環境: x-forwarded-for から取得
  const xForwardedFor = headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const ips = xForwardedFor.split(',').map(ip => ip.trim());
    // 右側からローカル/特殊IPを除外して最初に見つかったものを返す
    for (let i = ips.length - 1; i >= 0; i--) {
      const ip = ips[i];
      if (ip && !isLocalIp(ip)) {
        return ip;
      }
    }
    // 全てローカルIPの場合は最初のIPを返す
    if (ips.length > 0 && ips[0]) return ips[0];
  }

  return '0.0.0.0';
}

/**
 * ローカル/特殊IPアドレスかどうかを判定
 */
function isLocalIp(ip: string): boolean {
  return (
    ip.startsWith('10.') ||
    ip.startsWith('172.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('169.254.') ||
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '0.0.0.0'
  );
}

export function middleware(request: NextRequest) {
  // --- ステップ1: 環境変数から許可IPアドレスのリストを取得 ---
  // ALLOWED_IP_ADDRESSES_FOR_THE_ADMIN_PAGE="xxx.xxx.xxx.xxx yyy.yyy.yyy.yyy" のような形式を想定
  const allowedIpsString = process.env.ALLOWED_IP_ADDRESSES_FOR_THE_ADMIN_PAGE;

  // --- ステップ2: IP制限の要否を判断 ---
  // 環境変数が設定されていない、または値が空の文字列の場合は、IP制限を適用せず、全てのアクセスを許可します。
  // これにより、開発環境やIP制限が不要な場合に、この機能を簡単に無効化できます。
  if (!allowedIpsString) {
    return NextResponse.next(); // 次の処理（ページのレンダリングなど）へ進む
  }

  // 環境変数の値をスペースで分割し、IPアドレスの配列を生成します。
  // `filter` を使って、連続したスペースなどによって生まれる空の要素を取り除きます。
  const allowedIps = allowedIpsString.split(' ').filter(ip => ip.trim() !== '');

  // 空白文字のみが設定されているようなケースを考慮し、有効なIPが1つもなければ制限を行いません。
  if (allowedIps.length === 0) {
    return NextResponse.next();
  }

  // --- ステップ3: アクセス元IPアドレスの特定 ---
  // Cloud Run環境では 'x-forwarded-for' ヘッダーからクライアントIPを取得します。
  // x-forwarded-for は "client, proxy1, proxy2" の形式で、右側からローカルIP以外を探します。
  // Firebase App Hosting環境の場合は 'x-fah-client-ip' を優先します。
  const requestIp = getClientIpFromHeaders(request.headers);


  // --- ステップ4: アクセス許可の検証 ---
  // 取得したアクセス元IPが、許可IPリストに含まれているかを確認します。
  if (requestIp && allowedIps.includes(requestIp)) {
    return NextResponse.next(); // 許可されているため、次の処理へ進む
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
  return NextResponse.next();
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
  matcher: '/admin/:path*',
};
