/**
 * ユーザー情報取得 API
 * 
 * GET /api/auth/me
 * 
 * セッションクッキーからユーザー情報を取得して返します。
 * CDN対応のため、クライアントからの動的なユーザー取得に使用します。
 * Cache-Control は middleware.ts で一括付与（no-store, must-revalidate）
 */

import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';

export async function GET() {
  const user = await getUser();

  return NextResponse.json(user);
}
