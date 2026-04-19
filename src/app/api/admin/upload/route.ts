/**
 * メディアアップロード API
 * 
 * POST /api/admin/upload
 * 
 * S3 の Presigned URL を生成して返します。
 * クライアントはこの URL に直接アップロードします。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin-auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '@/lib/env';

const S3_BUCKET = process.env.S3_BUCKET_NAME || '';
const CLOUDFRONT_DOMAIN = process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN || '';
const REGION = process.env.AWS_REGION || 'ap-northeast-1';

let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3Client) {
    _s3Client = new S3Client({ region: REGION });
  }
  return _s3Client;
}

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser.isAuthenticated) {
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

  const { fileName, contentType } = body;

  if (!fileName || !contentType) {
    return NextResponse.json(
      { status: 'error', message: 'fileName と contentType が必要です。' },
      { status: 400 }
    );
  }

  // セキュリティチェック: 画像ファイルのみ許可
  if (!contentType.startsWith('image/')) {
    return NextResponse.json(
      { status: 'error', message: '画像ファイルのみアップロード可能です。' },
      { status: 400 }
    );
  }

  try {
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `media/articles/${adminUser.sub || 'admin'}/${timestamp}-${sanitizedFileName}`;

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 300 });

    // CloudFront 経由の公開 URL
    const publicUrl = CLOUDFRONT_DOMAIN
      ? `https://${CLOUDFRONT_DOMAIN}/${key}`
      : `https://${S3_BUCKET}.s3.${REGION}.amazonaws.com/${key}`;

    logger.info(`[Upload] Presigned URL generated: ${key}`);

    return NextResponse.json({
      status: 'success',
      presignedUrl,
      publicUrl,
      key,
    });
  } catch (error) {
    logger.error('[Upload] Presigned URL 生成エラー:', error);
    return NextResponse.json(
      { status: 'error', message: 'アップロードURL の生成に失敗しました。' },
      { status: 500 }
    );
  }
}
