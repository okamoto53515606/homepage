/**
 * サイト設定ページのサーバーアクション
 * 
 * @description
 * サイト設定フォームから送信されたデータを処理し、
 * Firestoreの /settings/site_config ドキュメントを更新します。
 */
'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { logger } from '@/lib/env';

// バリデーションスキーマ
const SettingsSchema = z.object({
  siteName: z.string().min(1, 'サイト名は必須です'),
  paymentAmount: z.coerce.number().int().min(1, '金額は1円以上である必要があります'),
  accessDurationDays: z.coerce.number().int().min(1, '日数は1日以上である必要があります'),
  metaTitle: z.string().min(1, 'Meta Titleは必須です'),
  metaDescription: z.string().min(1, 'Meta Descriptionは必須です'),
  legalCommerceContent: z.string(),
  privacyPolicyContent: z.string(),
  termsOfServiceContent: z.string(),
  copyright: z.string(), // コピーライトを追加
});

// フォームの状態を表す型
export interface SettingsFormState {
  status: 'idle' | 'success' | 'error';
  message: string;
}

/**
 * サイト設定を更新するサーバーアクション
 * @param prevState - 以前のフォーム状態
 * @param formData - フォームデータ
 * @returns 新しいフォーム状態
 */
export async function updateSettingsAction(
  prevState: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  // 管理者権限チェック
  const user = await getUser();
  if (user.role !== 'admin') {
    return { status: 'error', message: '管理者権限がありません。' };
  }

  const validatedFields = SettingsSchema.safeParse({
    siteName: formData.get('siteName'),
    paymentAmount: formData.get('paymentAmount'),
    accessDurationDays: formData.get('accessDurationDays'),
    metaTitle: formData.get('metaTitle'),
    metaDescription: formData.get('metaDescription'),
    legalCommerceContent: formData.get('legalCommerceContent'),
    privacyPolicyContent: formData.get('privacyPolicyContent'),
    termsOfServiceContent: formData.get('termsOfServiceContent'),
    copyright: formData.get('copyright'), // コピーライトを取得
  });

  // バリデーション失敗
  if (!validatedFields.success) {
    const errorMessages = validatedFields.error.issues.map(issue => issue.message).join('\n');
    return {
      status: 'error',
      message: `入力エラー: ${errorMessages}`,
    };
  }
  
  try {
    const db = getAdminDb();
    const settingsRef = db.collection('settings').doc('site_config');
    
    // Firestoreドキュメントを更新
    await settingsRef.set({
      ...validatedFields.data,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // 関連ページのキャッシュをクリア
    revalidatePath('/'); // トップページ
    revalidatePath('/legal/commerce');
    revalidatePath('/legal/privacy');
    revalidatePath('/legal/terms');
    revalidatePath('/admin/settings'); // 設定ページ自体も再検証

    logger.info('[Admin] サイト設定を更新しました。');

    return {
      status: 'success',
      message: '設定が正常に保存されました。',
    };

  } catch (error) {
    logger.error('[Admin] サイト設定の更新に失敗:', error);
    return {
      status: 'error',
      message: 'サーバーエラーが発生しました。設定の保存に失敗しました。',
    };
  }
}
