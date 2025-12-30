/**
 * Firebase クライアントSDK初期化
 * 
 * クライアントサイドで使用するFirebase SDKを初期化します。
 * - Firebase Auth（Googleログイン）
 * 
 * 【注意】
 * サーバーサイドではAdmin SDK（firebase-admin.ts）を使用してください。
 * このファイルはクライアント専用です。
 * 
 * 【Firestoreについて】
 * Firestoreへのアクセスはサーバーサイド（Admin SDK）で行います。
 * クライアントからはFirestoreを直接操作しません。
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, browserLocalPersistence, setPersistence } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

// Set persistence to local storage
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error('Failed to set persistence:', error);
  });
}

export { app, auth };
