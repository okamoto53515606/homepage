/**
 * ユーザーアクセス権管理（Mock実装）
 * 
 * このファイルは、利用者DBが完成するまでの仮実装です。
 * 本番では Firestore の users コレクションを使用し、
 * access_expiry フィールドでアクセス期限を管理します。
 * 
 * 【本番実装時の置き換え箇所】
 * - grantAccessToUser: Firestore の users/{uid}/access_expiry を更新
 * - getUserAccessExpiry: Firestore から users/{uid}/access_expiry を取得
 * - hasValidAccess: 上記を使って現在時刻と比較
 */

/**
 * Mock: メモリ上のアクセス権データ
 * 本番では Firestore に置き換え
 * 
 * 構造: { [userId]: accessExpiryDate }
 */
const mockAccessData: Map<string, Date> = new Map();

/**
 * ユーザーにN日間のアクセス権を付与する
 * 
 * 【本番実装】
 * ```typescript
 * import { doc, updateDoc, Timestamp } from 'firebase/firestore';
 * import { db } from './firebase';
 * 
 * async function grantAccessToUser(userId: string, days: number): Promise<void> {
 *   const userRef = doc(db, 'users', userId);
 *   const currentExpiry = await getUserAccessExpiry(userId);
 *   const baseDate = currentExpiry && currentExpiry > new Date() ? currentExpiry : new Date();
 *   const newExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
 *   await updateDoc(userRef, { access_expiry: Timestamp.fromDate(newExpiry) });
 * }
 * ```
 * 
 * @param userId - ユーザーID（Firebase Auth の uid）
 * @param days - 付与する日数
 */
export async function grantAccessToUser(userId: string, days: number): Promise<void> {
  // Mock: 既存の期限があればそこから延長、なければ現在時刻から
  const currentExpiry = mockAccessData.get(userId);
  const baseDate = currentExpiry && currentExpiry > new Date() ? currentExpiry : new Date();
  const newExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
  
  mockAccessData.set(userId, newExpiry);
  
  console.log(`[Mock] ユーザー ${userId} にアクセス権を付与: ${newExpiry.toISOString()}`);
}

/**
 * ユーザーのアクセス期限を取得する
 * 
 * 【本番実装】
 * ```typescript
 * import { doc, getDoc } from 'firebase/firestore';
 * import { db } from './firebase';
 * 
 * async function getUserAccessExpiry(userId: string): Promise<Date | null> {
 *   const userRef = doc(db, 'users', userId);
 *   const userSnap = await getDoc(userRef);
 *   if (!userSnap.exists()) return null;
 *   const data = userSnap.data();
 *   return data.access_expiry?.toDate() ?? null;
 * }
 * ```
 * 
 * @param userId - ユーザーID（Firebase Auth の uid）
 * @returns アクセス期限日時、未設定の場合は null
 */
export async function getUserAccessExpiry(userId: string): Promise<Date | null> {
  return mockAccessData.get(userId) ?? null;
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
  return expiry > new Date();
}

/**
 * Mock: 記事が有料かどうかを判定する
 * 
 * 【本番実装】
 * Firestore の articles コレクションから access フィールドを取得
 * 
 * 現在のMock実装では、data.ts の articles 配列の access フィールドを参照しています。
 * この関数は、将来的にDBから取得する際のインターフェースを統一するためのものです。
 * 
 * @param articleId - 記事ID
 * @returns 有料記事の場合は true
 */
export async function isArticlePaid(articleId: string): Promise<boolean> {
  // Mock: 現在は data.ts の getArticleBySlug を使用しているため、
  // この関数は将来のDB実装時に使用される予定
  // 今は呼び出し元で article.access === 'paid' を直接判定
  console.log(`[Mock] 記事 ${articleId} の課金判定を行います`);
  return true; // デフォルトで有料として扱う（テスト用）
}
