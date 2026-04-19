/**
 * 管理者ログアウト API
 * 
 * admin_session cookie を削除し、Cognito Hosted UI のログアウト URL にリダイレクト。
 */

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getCognitoLogoutUrl } from '@/lib/admin-auth';

const ADMIN_SESSION_COOKIE_NAME = 'admin_session';

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE_NAME);

  const logoutRedirectUrl = `${request.nextUrl.origin}/admin/login`;
  const cognitoLogoutUrl = getCognitoLogoutUrl(logoutRedirectUrl);

  return NextResponse.redirect(cognitoLogoutUrl, { status: 303 });
}
