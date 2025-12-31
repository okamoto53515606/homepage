/**
 * CLI: 管理者権限確認コマンド
 *
 * 指定されたメールアドレスのユーザーが管理者権限を持っているか確認します。
 *
 *【使い方】
 * npm run check-admin -- <user@example.com>
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
  console.log('使用法: npm run check-admin -- <user@example.com>');
  process.exit(1);
}

const checkAdminRole = async (email: string) => {
  try {
    const auth = getAdminAuth();
    console.log(`ユーザーを検索中: ${email}`);

    // メールアドレスでユーザーを取得
    const user = await auth.getUserByEmail(email);

    // カスタムクレームを確認
    const isAdmin = user.customClaims?.admin === true;

    if (isAdmin) {
      console.log(`✅ はい、ユーザー "${email}" は管理者です。`);
    } else {
      console.log(`❌ いいえ、ユーザー "${email}" は管理者ではありません。`);
    }
    console.log('現在のカスタムクレーム:', user.customClaims || 'なし');


  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      console.error(`エラー: ユーザー "${email}" が見つかりませんでした。`);
    } else {
      console.error('予期せぬエラーが発生しました:', error.message);
    }
    process.exit(1);
  }
};

checkAdminRole(email);
