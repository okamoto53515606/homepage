import { doc, getDoc, setDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

/**
 * ユーザーの users コレクションのドキュメント参照を取得または作成する
 */
async function getUserDocRef(userId: string) {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  
  // ユーザーのドキュメントがなければ作成する
  if (!userSnap.exists()) {
    await setDoc(userRef, { 
      uid: userId,
      created_at: serverTimestamp(),
    }, { merge: true });
    console.log(`User document created for ${userId}`);
  }
  
  return userRef;
}

/**
 * ユーザーにN日間のアクセス権を付与する
 * 
 * @param userId - ユーザーID（Firebase Auth の uid）
 * @param days - 付与する日数
 */
export async function grantAccessToUser(userId: string, days: number): Promise<void> {
  const userRef = await getUserDocRef(userId);
  const currentExpiry = await getUserAccessExpiry(userId);
  
  // 既存の有効期限が未来にあれば、そこから延長。なければ現在時刻から。
  const baseDate = currentExpiry && currentExpiry > new Date() ? currentExpiry : new Date();
  
  const newExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
  
  await setDoc(userRef, { 
    access_expiry: Timestamp.fromDate(newExpiry),
    updated_at: serverTimestamp(),
  }, { merge: true });

  console.log(`[Firestore] ユーザー ${userId} にアクセス権を付与: ${newExpiry.toISOString()}`);
}

/**
 * ユーザーのアクセス期限を取得する
 * 
 * @param userId - ユーザーID（Firebase Auth の uid）
 * @returns アクセス期限日時、未設定の場合は null
 */
export async function getUserAccessExpiry(userId: string): Promise<Date | null> {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  
  if (!userSnap.exists()) {
    return null;
  }
  
  const data = userSnap.data();
  return data.access_expiry?.toDate() ?? null;
}

/**
 * ユーザーが有効なアクセス権を持っているか確認する
 * 
 * @param userId - ユーザーID（Firebase Auth の uid）
 * @returns アクセス権が有効な場合は true
 */
export async function hasValidAccess(userId: string): Promise<boolean> {
  const expiry = await getUserAccessExpiry(userId);
  if (!expiry) return false;
  
  const hasAccess = expiry > new Date();
  console.log(`[Access Check] User: ${userId}, Expiry: ${expiry}, HasAccess: ${hasAccess}`);
  return hasAccess;
}
