/**
 * セッション管理API
 *
 * 【エンドポイント】
 * DELETE /api/auth/session - セッション破棄（ログアウト）
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logger } from '@/lib/env';

const SESSION_COOKIE_NAME = 'session';

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[Session] セッション破棄エラー:', error);
    return NextResponse.json(
      { error: 'ログアウトに失敗しました' },
      { status: 500 }
    );
  }
}
