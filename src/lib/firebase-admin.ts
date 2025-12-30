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
  
  // サービスアカウントキーが存在する場合、既存のアプリが正しく初期化されているか確認
  // 既存のアプリがあっても、credentials なしで初期化されている可能性がある
  const hasServiceAccountKey = !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  console.log('[Admin SDK] FIREBASE_SERVICE_ACCOUNT_KEY exists:', hasServiceAccountKey);
  console.log('[Admin SDK] Existing apps count:', apps.length);
  
  // 既存アプリがあり、サービスアカウントキーがない場合のみ既存を使用
  if (apps.length > 0 && !hasServiceAccountKey) {
    adminApp = apps[0];
    console.log('[Admin SDK] Using existing app (no service account key)');
    return adminApp;
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  
  if (hasServiceAccountKey) {
    try {
      // JSON文字列として環境変数に設定されている場合
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
      
      // 環境変数では \n がリテラル文字列として保存されるため、実際の改行に変換
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      
      console.log('[Admin SDK] Service account email:', serviceAccount.client_email);
      console.log('[Admin SDK] Private key starts with:', serviceAccount.private_key?.substring(0, 30));
      
      // 既存のアプリがある場合でも、新しい名前で初期化
      if (apps.length > 0) {
        adminApp = initializeApp({
          credential: cert(serviceAccount),
          projectId,
        }, 'admin-with-credentials');
        console.log('[Admin SDK] Initialized NEW app with service account key');
      } else {
        adminApp = initializeApp({
          credential: cert(serviceAccount),
          projectId,
        });
        console.log('[Admin SDK] Initialized with service account key');
      }
    } catch (error) {
      console.error('[Admin SDK] Failed to parse service account key:', error);
      throw error;
    }
  } else {
    // ローカル開発環境: gcloud auth application-default login で認証済みの場合
    // ADC（Application Default Credentials）を自動的に使用
    if (apps.length > 0) {
      adminApp = apps[0];
      console.log('[Admin SDK] Using existing app with default credentials');
    } else {
      adminApp = initializeApp({
        projectId,
      });
      console.log('[Admin SDK] Initialized with default credentials');
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
