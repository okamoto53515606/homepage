/**
 * Firebase Admin SDK 初期化
 * サーバーサイド（API Routes, Webhook など）で使用
 * 
 * 注意: クライアントサイドでは src/lib/firebase.ts を使用
 */
import { initializeApp, getApps, getApp, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let adminApp: App | undefined;
let adminDb: Firestore | undefined;

const ADMIN_APP_NAME = 'admin-with-credentials';

function getAdminApp(): App {
  if (adminApp) {
    return adminApp;
  }

  const apps = getApps();
  const hasServiceAccountKey = !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  
  console.log('[Admin SDK] FIREBASE_SERVICE_ACCOUNT_KEY exists:', hasServiceAccountKey);
  console.log('[Admin SDK] Existing apps count:', apps.length);
  console.log('[Admin SDK] Existing app names:', apps.map(a => a.name).join(', '));
  
  // サービスアカウントキーがある場合
  if (hasServiceAccountKey) {
    // 既に admin-with-credentials という名前のアプリがあれば、それを使用
    const existingAdminApp = apps.find(app => app.name === ADMIN_APP_NAME);
    if (existingAdminApp) {
      console.log('[Admin SDK] Reusing existing app:', ADMIN_APP_NAME);
      adminApp = existingAdminApp;
      return adminApp;
    }
    
    // デフォルトアプリがあり、それが credentials 付きで初期化されている可能性がある場合
    // apps[0] を使用（Firebase Studio では ADC が使われることもある）
    
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
      
      // 環境変数では \n がリテラル文字列として保存されるため、実際の改行に変換
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      
      console.log('[Admin SDK] Service account email:', serviceAccount.client_email);
      
      const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      
      // 既存のアプリがある場合は別名で、ない場合はデフォルトで初期化
      if (apps.length > 0) {
        adminApp = initializeApp({
          credential: cert(serviceAccount),
          projectId,
        }, ADMIN_APP_NAME);
        console.log('[Admin SDK] Initialized NEW app with name:', ADMIN_APP_NAME);
      } else {
        adminApp = initializeApp({
          credential: cert(serviceAccount),
          projectId,
        });
        console.log('[Admin SDK] Initialized default app with service account key');
      }
      
      return adminApp;
    } catch (error) {
      console.error('[Admin SDK] Failed to initialize with service account:', error);
      throw error;
    }
  }
  
  // サービスアカウントキーがない場合（ローカル開発で gcloud ADC を使用）
  if (apps.length > 0) {
    adminApp = apps[0];
    console.log('[Admin SDK] Using existing app with default credentials');
  } else {
    adminApp = initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
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
