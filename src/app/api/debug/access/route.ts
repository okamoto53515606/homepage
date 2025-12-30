import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { grantAccessToUserAdmin, getUserAccessExpiryAdmin } from '@/lib/user-access-admin';
import { cookies } from 'next/headers';

/**
 * デバッグ用API: ユーザーのアクセス情報を確認・更新
 * 
 * GET: 現在のアクセス状態を確認
 * POST: 30日間のアクセス権を付与（デバッグ用）
 * 
 * 【セッションクッキー対応】
 * auth_uidではなく、セッションクッキーからユーザーIDを取得します。
 */

/** セッションクッキーからユーザーIDを取得 */
async function getUserIdFromSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session')?.value;
  
  if (!sessionCookie) {
    return null;
  }
  
  try {
    const auth = getAdminAuth();
    const decodedClaims = await auth.verifySessionCookie(sessionCookie, true);
    return decodedClaims.uid;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession();
    
    if (!userId) {
      return NextResponse.json({ error: 'Not logged in', userId: null });
    }
    
    const db = getAdminDb();
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    
    const accessExpiry = await getUserAccessExpiryAdmin(userId);
    const hasAccess = accessExpiry ? accessExpiry > new Date() : false;
    
    return NextResponse.json({
      userId,
      userExists: userDoc.exists,
      userData: userData ? {
        ...userData,
        access_expiry: userData.access_expiry?.toDate?.()?.toISOString() || null,
        created_at: userData.created_at?.toDate?.()?.toISOString() || null,
        updated_at: userData.updated_at?.toDate?.()?.toISOString() || null,
      } : null,
      accessExpiry: accessExpiry?.toISOString() || null,
      hasAccess,
      currentTime: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Debug API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession();
    
    if (!userId) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }
    
    // 30日間のアクセス権を付与
    await grantAccessToUserAdmin(userId, 30);
    
    const accessExpiry = await getUserAccessExpiryAdmin(userId);
    
    return NextResponse.json({
      success: true,
      userId,
      newAccessExpiry: accessExpiry?.toISOString(),
      message: '30日間のアクセス権を付与しました',
    });
  } catch (error: any) {
    console.error('Debug API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
