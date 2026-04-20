/**
 * メディアアップロード API
 * 
 * POST /api/admin/upload
 * 
 * クライアントから FormData でファイルを受け取り、サーバー側で S3 にアップロードします。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin-auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '@/lib/env';

const S3_BUCKET = process.env.S3_BUCKET_NAME || '';
const CLOUDFRONT_DOMAIN = process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN || '';
const REGION = process.env.AWS_REGION || 'ap-northeast-1';
const IS_DEV = process.env.NODE_ENV !== 'production';

/** アップロードサイズ上限: 10MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'リクエストが不正です。FormData を送信してください。' },
      { status: 400 }
    );
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { status: 'error', message: 'file フィールドが必要です。' },
      { status: 400 }
    );
  }

  // セキュリティチェック: 画像ファイルのみ許可
  if (!file.type.startsWith('image/')) {
    return NextResponse.json(
      { status: 'error', message: '画像ファイルのみアップロード可能です。' },
      { status: 400 }
    );
  }

  // サイズチェック
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { status: 'error', message: `ファイルサイズは ${MAX_FILE_SIZE / 1024 / 1024}MB 以下にしてください。` },
      { status: 400 }
    );
  }

  try {
    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `media/articles/${adminUser.sub || 'admin'}/${timestamp}-${sanitizedFileName}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    await getS3Client().send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type,
      CacheControl: 'public, max-age=31536000, immutable',
    }));

    // 公開 URL: 本番は相対パス（同一ドメイン）、開発は CloudFront ドメイン
    const publicUrl = IS_DEV && CLOUDFRONT_DOMAIN
      ? `https://${CLOUDFRONT_DOMAIN}/${key}`
      : `/${key}`;

    logger.info(`[Upload] S3 アップロード完了: ${key} (${file.size} bytes)`);

    return NextResponse.json({
      status: 'success',
      publicUrl,
      key,
    });
  } catch (error) {
    logger.error('[Upload] S3 アップロードエラー:', error);
    return NextResponse.json(
      { status: 'error', message: 'ファイルのアップロードに失敗しました。' },
      { status: 500 }
    );
  }
}
