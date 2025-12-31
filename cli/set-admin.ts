/**
 * CLI: 管理者権限付与コマンド
 *
 * 指定されたメールアドレスのユーザーに、
 * Firebase Auth の Custom Claims を使って管理者権限を付与します。
 *
 *【使い方】
 * npm run set-admin -- <user@example.com>
 *
 *【セキュリティ】
 * 本番環境 (NODE_ENV=production) では実行できません。
 */
import 'dotenv/config'; // .envファイルを読み込む
import { getAdminAuth } from '../src/lib/firebase-admin';

// 本番環境での実行を防止
if (process.env.NODE_ENV === 'production') {
  console.error('エラー: このスクリプトは本番環境では実行できません。');
  process.exit(1);
}

const email = process.argv[2];

if (!email) {
  console.error('エラー: メールアドレスを引数に指定してください。');
  console.log('使用法: npm run set-admin -- <user@example.com>');
  process.exit(1);
}

const setAdminRole = async (email: string) => {
  try {
    const auth = getAdminAuth();
    console.log(`ユーザーを検索中: ${email}`);

    // メールアドレスでユーザーを取得
    const user = await auth.getUserByEmail(email);
    
    // 既存のクレームを取得
    const existingClaims = user.customClaims || {};

    // adminクレームを付与
    await auth.setCustomUserClaims(user.uid, { ...existingClaims, admin: true });

    console.log('✅ 成功しました！');
    console.log(`ユーザー "${email}" (UID: ${user.uid}) に管理者権限を付与しました。`);
    console.log('反映には数分かかる場合があります。');

  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      console.error(`エラー: ユーザー "${email}" が見つかりませんでした。`);
    } else {
      console.error('予期せぬエラーが発生しました:', error.message);
    }
    process.exit(1);
  }
};

setAdminRole(email);
