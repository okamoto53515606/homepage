/**
 * サイト設定更新 API
 * 
 * PUT /api/admin/settings
 * 
 * 管理者がサイト設定を更新します。
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { logger } from '@/lib/env';
import { getDocClient, Tables } from '@/lib/dynamodb';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

const SettingsSchema = z.object({
  siteName: z.string().min(1, 'サイト名は必須です'),
  paymentAmount: z.coerce.number().int().min(1, '金額は1円以上である必要があります'),
  accessDurationDays: z.coerce.number().int().min(1, '日数は1日以上である必要があります'),
  metaTitle: z.string().min(1, 'Meta Titleは必須です'),
  metaDescription: z.string().min(1, 'Meta Descriptionは必須です'),
  legalCommerceContent: z.string(),
  privacyPolicyContent: z.string(),
  termsOfServiceContent: z.string(),
  copyright: z.string(),
  gtmId: z.string().regex(/^(GTM-[A-Z0-9]+)?$/, 'GTM IDはGTM-で始まる形式で入力してください（例: GTM-XXXXXXX）'),
});

export async function PUT(request: NextRequest) {
  const user = await getUser();
  if (user.role !== 'admin') {
    return NextResponse.json(
      { status: 'error', message: '管理者権限がありません。' },
      { status: 403 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'リクエストボディが不正です。' },
      { status: 400 }
    );
  }

  const validatedFields = SettingsSchema.safeParse(body);

  if (!validatedFields.success) {
    const errorMessages = validatedFields.error.issues.map(issue => issue.message).join('\n');
    return NextResponse.json(
      { status: 'error', message: `入力エラー: ${errorMessages}` },
      { status: 400 }
    );
  }

  try {
    await getDocClient().send(new PutCommand({
      TableName: Tables.settings,
      Item: {
        configId: 'site_config',
        ...validatedFields.data,
        updatedAt: new Date().toISOString(),
      },
    }));

    revalidatePath('/');
    revalidatePath('/legal/commerce');
    revalidatePath('/legal/privacy');
    revalidatePath('/legal/terms');
    revalidatePath('/admin/settings');

    logger.info('[Admin] サイト設定を更新しました。');

    return NextResponse.json({
      status: 'success',
      message: '設定が正常に保存されました。',
    });
  } catch (error) {
    logger.error('[Admin] サイト設定の更新に失敗:', error);
    return NextResponse.json(
      { status: 'error', message: 'サーバーエラーが発生しました。設定の保存に失敗しました。' },
      { status: 500 }
    );
  }
}
