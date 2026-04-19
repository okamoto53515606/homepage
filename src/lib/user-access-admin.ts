/**
 * サーバーサイド用ユーザーアクセス権管理
 * DynamoDB を使用
 * 
 * Webhook など API Routes から呼び出す場合はこちらを使用
 */
import { getDocClient, Tables } from './dynamodb';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { logger } from './env';
import { randomUUID } from 'crypto';

/**
 * ユーザーにN日間のアクセス権を付与する（サーバーサイド用）
 * 
 * @param userId - ユーザーID（google_uid）
 * @param days - 付与する日数
 */
export async function grantAccessToUserAdmin(userId: string, days: number): Promise<void> {
  const docClient = getDocClient();
  
  // 既存の有効期限を取得
  const result = await docClient.send(new GetCommand({
    TableName: Tables.users,
    Key: { userId },
    ProjectionExpression: 'access_expiry',
  }));
  
  let currentExpiry: Date | null = null;
  if (result.Item?.access_expiry) {
    currentExpiry = new Date(result.Item.access_expiry);
    logger.info(`[Admin] 既存データ: access_expiry=${currentExpiry.toISOString()}`);
  } else {
    logger.info(`[Admin] ユーザードキュメントが存在しないか、access_expiryなし`);
  }
  
  // 既存の有効期限が未来にあれば、そこから延長。なければ現在時刻から。
  const now = new Date();
  const baseDate = currentExpiry && currentExpiry > now ? currentExpiry : now;
  logger.info(`[Admin] 計算: now=${now.toISOString()}, baseDate=${baseDate.toISOString()}, days=${days}`);
  const newExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
  
  await docClient.send(new UpdateCommand({
    TableName: Tables.users,
    Key: { userId },
    UpdateExpression: 'SET access_expiry = :expiry, updated_at = :now',
    ExpressionAttributeValues: {
      ':expiry': newExpiry.toISOString(),
      ':now': new Date().toISOString(),
    },
  }));

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
  const paymentId = randomUUID();
  
  await getDocClient().send(new PutCommand({
    TableName: Tables.payments,
    Item: {
      paymentId,
      ...paymentData,
      created_at: paymentData.created_at.toISOString(),
    },
  }));
  
  logger.info(`[Admin] 決済履歴を作成: ${paymentId}`);
  return paymentId;
}
