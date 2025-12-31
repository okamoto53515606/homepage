/**
 * CLI: 管理者権限削除コマンド
 *
 * 指定されたメールアドレスのユーザーから、
 * Firebase Auth の Custom Claims を使って管理者権限を削除します。
 *
 *【使い方】
 * npm run remove-admin -- <user@example.com>
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
  console.log('使用法: npm run remove-admin -- <user@example.com>');
  process.exit(1);
}

const removeAdminRole = async (email: string) => {
  try {
    const auth = getAdminAuth();
    console.log(`ユーザーを検索中: ${email}`);

    // メールアドレスでユーザーを取得
    const user = await auth.getUserByEmail(email);

    // 既存のクレームを取得し、adminプロパティを削除
    const { admin, ...restClaims } = user.customClaims || {};

    if (admin === undefined) {
      console.log(`ユーザー "${email}" には管理者権限が付与されていません。`);
      return;
    }
    
    // adminクレームを削除して更新
    await auth.setCustomUserClaims(user.uid, restClaims);

    console.log('✅ 成功しました！');
    console.log(`ユーザー "${email}" (UID: ${user.uid}) から管理者権限を削除しました。`);

  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      console.error(`エラー: ユーザー "${email}" が見つかりませんでした。`);
    } else {
      console.error('予期せぬエラーが発生しました:', error.message);
    }
    process.exit(1);
  }
};

removeAdminRole(email);
