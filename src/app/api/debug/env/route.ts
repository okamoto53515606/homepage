import { NextResponse } from 'next/server';

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

  return NextResponse.json(envStatus);
}
