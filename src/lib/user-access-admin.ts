/**
 * サーバーサイド用ユーザーアクセス権管理
 * Firebase Admin SDK を使用（セキュリティルールをバイパス）
 * 
 * Webhook など API Routes から呼び出す場合はこちらを使用
 */
import { getAdminDb } from './firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { logger } from './env';

/**
 * ユーザーにN日間のアクセス権を付与する（サーバーサイド用）
 * 
 * @param userId - ユーザーID（Firebase Auth の uid）
 * @param days - 付与する日数
 */
export async function grantAccessToUserAdmin(userId: string, days: number): Promise<void> {
  const db = getAdminDb();
  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  
  // 既存の有効期限を取得
  let currentExpiry: Date | null = null;
  if (userSnap.exists) {
    const data = userSnap.data();
    currentExpiry = data?.access_expiry?.toDate() ?? null;
    logger.info(`[Admin] 既存データ: access_expiry=${currentExpiry?.toISOString() ?? 'なし'}`);
  } else {
    logger.info(`[Admin] ユーザードキュメントが存在しません`);
  }
  
  // 既存の有効期限が未来にあれば、そこから延長。なければ現在時刻から。
  const now = new Date();
  const baseDate = currentExpiry && currentExpiry > now ? currentExpiry : now;
  logger.info(`[Admin] 計算: now=${now.toISOString()}, baseDate=${baseDate.toISOString()}, days=${days}`);
  const newExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
  
  await userRef.set({
    access_expiry: Timestamp.fromDate(newExpiry),
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });

  logger.info(`[Admin] ユーザー ${userId} にアクセス権を付与: ${newExpiry.toISOString()}`);
}

/**
 * 決済履歴を作成する（サーバーサイド用）
 */
export async function createPaymentRecord(paymentData: {
  user_id: string;
  stripe_session_id: string;
  stripe_payment_intent_id: string | null;
  amount: number | null;
  currency: string | null;
  status: string;
  ip_address: string;
  created_at: Date;
}): Promise<string> {
  const db = getAdminDb();
  const paymentRef = await db.collection('payments').add({
    ...paymentData,
    created_at: Timestamp.fromDate(paymentData.created_at),
  });
  
  logger.info(`[Admin] 決済履歴を作成: ${paymentRef.id}`);
  return paymentRef.id;
}
