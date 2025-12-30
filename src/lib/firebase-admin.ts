/**
 * Firebase Admin SDK 初期化
 * サーバーサイド（API Routes, Webhook など）で使用
 * 
 * 注意: クライアントサイドでは src/lib/firebase.ts を使用
 */
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let adminApp: App | undefined;
let adminDb: Firestore | undefined;

function getAdminApp(): App {
  if (adminApp) {
    return adminApp;
  }

  const apps = getApps();
  if (apps.length > 0) {
    adminApp = apps[0];
    return adminApp;
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  // 環境変数からサービスアカウントキーを取得
  const hasServiceAccountKey = !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  console.log('[Admin SDK] FIREBASE_SERVICE_ACCOUNT_KEY exists:', hasServiceAccountKey);
  console.log('[Admin SDK] Key length:', process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.length || 0);
  
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    // JSON文字列として環境変数に設定されている場合
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    
    // 環境変数では \n がリテラル文字列として保存されるため、実際の改行に変換
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    
    adminApp = initializeApp({
      credential: cert(serviceAccount),
      projectId,
    });
    console.log('[Admin SDK] Initialized with service account key');
  } else {
    // ローカル開発環境: gcloud auth application-default login で認証済みの場合
    // ADC（Application Default Credentials）を自動的に使用
    adminApp = initializeApp({
      projectId,
    });
    console.log('[Admin SDK] Initialized with default credentials');
  }

  return adminApp;
}

export function getAdminDb(): Firestore {
  if (adminDb) {
    return adminDb;
  }
  
  const app = getAdminApp();
  adminDb = getFirestore(app);
  return adminDb;
}
