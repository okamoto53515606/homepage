/**
 * メディアアップロード API
 *
 * POST /api/admin/upload
 *
 * クライアントから JSON で Base64 化したファイルを受け取り、S3 にアップロードします。
 *
 * 【なぜ multipart/form-data ではなく JSON(Base64) なのか】
 * CloudFront OAC + Lambda Function URL 経由では、body の SHA256 を
 * x-amz-content-sha256 ヘッダに正しく載せる必要がある（AWS 公式仕様）。
 * FormData はブラウザが boundary 付き multipart を内部生成するため、
 * クライアント側で送信直前の厳密なバイト列ハッシュを事前計算できず、
 * "UNSIGNED-PAYLOAD" を送ると Lambda が拒否する。
 * JSON 文字列なら送信バイト列が確定しハッシュが一致するため、
 * Base64 エンコードで JSON に載せてこの制約を回避する。
 *
 * 【受け付ける形式と検証の多層化】
 * Content-Type はクライアントの自己申告であり、S3 のメタデータとしてそのまま
 * 配信される。よって「中身は任意、Content-Type だけ画像」を作られないよう:
 *   1. 形式の許可リスト（PNG / JPEG / WebP / GIF / AVIF）で判定し、それ以外は 400
 *   2. 実データの先頭バイト（マジックバイト）が上記のいずれかであることを検証
 *   3. 1 と 2 が一致しない場合は 400
 *   4. S3 に書く ContentType / 拡張子は **検出結果** を使う（申告値は使わない）
 *
 * SVG を許可しない理由: SVG は XML に <script> を埋め込める「実行可能な画像」で、
 * `/media/*` は同一オリジン・CSP なしで配信される。直接開かせるとサイトのオリジンで
 * JS が実行される Stored XSS になり、管理者セッションで `/api/admin/*`（シークレット
 * 設定を含む）を叩けてしまう。
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getAdminUser } from '@/lib/admin-auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '@/lib/env';
import {
  detectImageType,
  imageTypeToExtension,
  normalizeImageContentType,
  type AllowedImageType,
} from '@/lib/image-signature';

const S3_BUCKET = process.env.S3_BUCKET_NAME || '';
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN || '';
const REGION = process.env.AWS_REGION || 'ap-northeast-1';
const IS_DEV = process.env.NODE_ENV !== 'production';

/** アップロードサイズ上限: 10MB（Base64 デコード後の実バイト数） */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Base64 文字列長の上限
 *
 * why: デコードしてからサイズを見ると、上限超過リクエストでも一度フルにメモリを
 *      確保してしまう。Base64 は 3 バイト → 4 文字なので 4/3 を掛けた長さで
 *      文字列の時点で弾き、無駄な確保を避ける。
 */
const MAX_BASE64_LENGTH = Math.ceil(MAX_FILE_SIZE / 3) * 4;

/**
 * ファイル名の上限
 *
 * why: S3 のキー長上限は 1024 バイト。長すぎる filename をそのまま使うと
 *      キー超過で例外 → 500 になるため、入力段階で 400 に落とす。
 */
const MAX_FILENAME_LENGTH = 120;

let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3Client) {
    _s3Client = new S3Client({ region: REGION });
  }
  return _s3Client;
}

/**
 * リクエストボディの「形（型）」を検証する
 *
 * why: 以前は `if (!filename || !contentType || !dataBase64)` の存在チェックだけで、
 *      `{"contentType": 123}` のような非文字列を送られると `.startsWith()` が
 *      TypeError を投げ、未処理の 500 になっていた（DAST の Active Scan が拾う典型）。
 *      型と長さを Zod で縛り、すべて 400 に落とす。
 *
 * why(maxMessage): dataBase64 の長さ上限はここで弾く。中身の検証は
 *      デコード後（サイズ・マジックバイト）で行う。
 */
const UploadSchema = z.object({
  filename: z
    .string()
    .min(1, 'filename は必須です')
    .max(MAX_FILENAME_LENGTH, `filename は ${MAX_FILENAME_LENGTH} 文字以内にしてください`),
  contentType: z.string().min(1, 'contentType は必須です').max(100, 'contentType が長すぎます'),
  dataBase64: z
    .string()
    .min(1, 'dataBase64 は必須です')
    .max(MAX_BASE64_LENGTH, 'ファイルサイズが上限を超えています'),
});

/**
 * S3 オブジェクトキーを組み立てる
 *
 * why(拡張子): クライアントの filename ではなく **実データから判定した形式** を使う。
 *   `.svg` という名前で PNG を上げる／その逆を許すと、拡張子と Content-Type が
 *   食い違ったオブジェクトが生まれ、配信時の解釈が実装依存になる。
 *
 * why(サニタイズ): `/` `\` を `_` に潰すため `../` でキーを脱出できない。
 *   先頭の `._-` は除去し、`..` だけの名前でも `image` にフォールバックする。
 *
 * why(ランダムサフィックス): `Date.now()` だけだと同一ミリ秒の同時アップロードで
 *   キーが衝突し、既存記事の画像を黙って上書きしてしまう。
 */
function buildObjectKey(
  adminSub: string | undefined,
  filename: string,
  type: AllowedImageType
): string {
  const baseName =
    filename
      .replace(/\.[^./\\]*$/, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/^[._-]+/, '')
      .slice(0, 60) || 'image';
  const extension = imageTypeToExtension(type);
  return `media/articles/${adminSub ?? 'admin'}/${Date.now()}-${randomUUID().slice(0, 8)}-${baseName}.${extension}`;
}

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser.isAuthenticated) {
    return NextResponse.json(
      { status: 'error', message: '管理者権限がありません。' },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'リクエストが不正です。JSON を送信してください。' },
      { status: 400 }
    );
  }

  const parsed = UploadSchema.safeParse(body);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => issue.message).join('\n');
    return NextResponse.json(
      { status: 'error', message: `入力エラー: ${messages}` },
      { status: 400 }
    );
  }

  // 申告された Content-Type の許可リスト判定
  // why: 実データの判定より先に弾くことで、SVG のような「実行可能な画像」を
  //      デコード前に落とせる。下のマジックバイト検証と二重で確認する。
  //      `image/*` を丸ごと許可すると image/svg+xml が通ってしまう。
  const declaredType = normalizeImageContentType(parsed.data.contentType);
  if (!declaredType) {
    return NextResponse.json(
      {
        status: 'error',
        message:
          '対応していない画像形式です（PNG / JPEG / WebP / GIF / AVIF のみ）。SVG は安全上の理由により受け付けません。',
      },
      { status: 400 }
    );
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(parsed.data.dataBase64, 'base64');
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Base64 データの解析に失敗しました。' },
      { status: 400 }
    );
  }

  // サイズチェック（デコード後の実バイト数）
  if (buffer.length === 0 || buffer.length > MAX_FILE_SIZE) {
    return NextResponse.json(
      { status: 'error', message: `ファイルサイズは 1 〜 ${MAX_FILE_SIZE / 1024 / 1024}MB にしてください。` },
      { status: 400 }
    );
  }

  // 実データ（マジックバイト）の検証
  // why: Content-Type はクライアントの自己申告なので、中身が本当に画像かを
  //      先頭バイトで確認する。判定できない（SVG テキスト・HTML・壊れたデータ）は拒否。
  const detectedType = detectImageType(buffer);
  if (!detectedType) {
    return NextResponse.json(
      {
        status: 'error',
        message:
          '画像データとして認識できませんでした。PNG / JPEG / WebP / GIF / AVIF のいずれかを送信してください。',
      },
      { status: 400 }
    );
  }

  // 申告値と実データの不一致は拒否
  // why: 「PNG と申告して中身は JPEG」を許すと、拡張子と実体が食い違ったオブジェクトが
  //      配信され、後段のツール（画像変換・CDN の最適化等）で解釈が割れる。
  if (detectedType !== declaredType) {
    return NextResponse.json(
      { status: 'error', message: 'Content-Type と実データの形式が一致しません。' },
      { status: 400 }
    );
  }

  try {
    const key = buildObjectKey(adminUser.sub, parsed.data.filename, detectedType);

    await getS3Client().send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      // why: ContentType はクライアント申告値ではなく **検出結果** を書く。
      //   申告値をそのまま書くと「中身は任意、Content-Type だけ image/svg+xml」が成立し、
      //   S3 → CloudFront がそのまま配信して同一オリジンでの Stored XSS になる。
      ContentType: detectedType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));

    // 公開 URL: 本番は相対パス（同一ドメイン）、開発は CloudFront ドメイン
    const publicUrl = IS_DEV && CLOUDFRONT_DOMAIN
      ? `https://${CLOUDFRONT_DOMAIN}/${key}`
      : `/${key}`;

    logger.info(`[Upload] S3 アップロード完了: ${key} (${buffer.length} bytes)`);

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
