/**
 * Firebase Admin SDK 初期化
 * サーバーサイド（API Routes, Webhook など）で使用
 * 
 * 注意: クライアントサイドでは src/lib/firebase.ts を使用
 */
import { initializeApp, getApps, cert, applicationDefault, App } from 'firebase-admin/app';
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

  // 環境変数から認証情報を取得
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    // JSON文字列として環境変数に設定されている場合
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    adminApp = initializeApp({
      credential: cert(serviceAccount),
      projectId,
    });
    console.log('[Admin SDK] Initialized with service account key');
  } else {
    // Firebase Studio や Cloud Run など、ADC（Application Default Credentials）を使用
    // applicationDefault() を使用して明示的に認証情報を取得
    try {
      adminApp = initializeApp({
        credential: applicationDefault(),
        projectId,
      });
      console.log('[Admin SDK] Initialized with application default credentials');
    } catch (error) {
      console.error('[Admin SDK] Failed to initialize with ADC:', error);
      // フォールバック: projectIdのみで初期化（一部の環境で動作）
      adminApp = initializeApp({
        projectId,
      });
      console.log('[Admin SDK] Initialized with projectId only (fallback)');
    }
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
