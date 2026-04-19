/**
 * Stripe 課金設定取得 API
 * 
 * GET /api/stripe/config
 * 
 * DynamoDB から動的な課金設定（金額、日数）を返します。
 */

import { NextResponse } from 'next/server';
import { getDynamicPaymentConfig } from '@/lib/stripe';

export async function GET() {
  const config = await getDynamicPaymentConfig();

  return NextResponse.json(config);
}
