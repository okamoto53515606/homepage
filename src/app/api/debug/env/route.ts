/**
 * デバッグ用API: 環境変数確認
 * 
 * Firebase Admin SDKやStripeの環境変数が正しく設定されているか確認します。
 * 本番環境では削除または認証を追加してください。
 */

import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET() {
  // 環境変数の状態をチェック
  const envStatus = {
    FIREBASE_SERVICE_ACCOUNT_KEY: {
      exists: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
      length: process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.length || 0,
      startsWithBrace: process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.startsWith('{') || false,
      // 最初の50文字だけ表示（セキュリティのため）
      preview: process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.substring(0, 50) + '...' || 'N/A',
    },
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'N/A',
    STRIPE_SECRET_KEY: {
      exists: !!process.env.STRIPE_SECRET_KEY,
      length: process.env.STRIPE_SECRET_KEY?.length || 0,
    },
    // Google Cloud の ADC 関連
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'N/A',
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT || 'N/A',
    GCLOUD_PROJECT: process.env.GCLOUD_PROJECT || 'N/A',
    // Node環境
    NODE_ENV: process.env.NODE_ENV,
  };

  // Firestoreへの接続テスト
  let firestoreTest = { success: false, error: '' };
  try {
    const db = getAdminDb();
    // テスト読み込み
    const testDoc = await db.collection('_test').doc('connection').get();
    firestoreTest = { success: true, error: '' };
  } catch (error) {
    firestoreTest = { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }

  return NextResponse.json({ 
    envStatus, 
    firestoreTest,
    timestamp: new Date().toISOString()
  });
}
