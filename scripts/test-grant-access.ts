/**
 * 手動でアクセス権を付与するテストスクリプト
 * 
 * 使い方:
 * npx tsx scripts/test-grant-access.ts <userId>
 * 
 * 例:
 * npx tsx scripts/test-grant-access.ts lbqsiykO3gYsdz8oQe7kwqgU4Xu2
 */

import { grantAccessToUser, getUserAccessExpiry, hasValidAccess } from '../src/lib/user-access';

async function main() {
  const userId = process.argv[2];
  
  if (!userId) {
    console.error('使用方法: npx tsx scripts/test-grant-access.ts <userId>');
    console.error('例: npx tsx scripts/test-grant-access.ts lbqsiykO3gYsdz8oQe7kwqgU4Xu2');
    process.exit(1);
  }

  console.log(`\n=== アクセス権付与テスト ===`);
  console.log(`ユーザーID: ${userId}`);
  
  // 現在の状態を確認
  console.log(`\n--- 付与前の状態 ---`);
  const beforeExpiry = await getUserAccessExpiry(userId);
  const beforeAccess = await hasValidAccess(userId);
  console.log(`アクセス期限: ${beforeExpiry?.toISOString() ?? '未設定'}`);
  console.log(`有効なアクセス権: ${beforeAccess}`);

  // 30日間のアクセス権を付与
  console.log(`\n--- アクセス権を30日間付与 ---`);
  await grantAccessToUser(userId, 30);

  // 付与後の状態を確認
  console.log(`\n--- 付与後の状態 ---`);
  const afterExpiry = await getUserAccessExpiry(userId);
  const afterAccess = await hasValidAccess(userId);
  console.log(`アクセス期限: ${afterExpiry?.toISOString() ?? '未設定'}`);
  console.log(`有効なアクセス権: ${afterAccess}`);

  console.log(`\n=== テスト完了 ===\n`);
  process.exit(0);
}

main().catch((error) => {
  console.error('エラー:', error);
  process.exit(1);
});
