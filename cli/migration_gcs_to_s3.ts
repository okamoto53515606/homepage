/**
 * ============================================================================
 * GCS → S3 メディアファイル移行スクリプト
 * ============================================================================
 *
 * 【概要】
 * Firebase Storage (GCS) のメディアファイルを S3 にコピーする。
 * 設計書: docs/s3-migration_v2.md
 *
 * 【実行方法】
 * $ npx tsx cli/migration_gcs_to_s3.ts
 *
 * 【前提条件】
 * - GCS: Firebase サービスアカウント鍵ファイルのパスを設定
 * - AWS: aws cli が管理権限で利用可能（~/.aws/credentials 設定済み）
 * - S3: CDK で homepage-media-{account} バケットが作成済み
 *
 * 【移行方針】
 * - GCS バケットの articles/ 配下を全て S3 にコピー
 * - S3 キーは GCS のパスをそのまま維持（uid もそのまま）
 * - Content-Type を維持
 * - 冪等: 同一キーへの再アップロードは上書き（再実行可能）
 *
 * ============================================================================
 */

import { Storage } from '@google-cloud/storage';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// 定数
// ============================================================================

const AWS_REGION = 'ap-northeast-1';
const S3_BUCKET = 'homepage-media-210387976006';

/** GCS バケット名 */
const GCS_BUCKET = 'studio-4200137858-cfe20.firebasestorage.app';

/** GCS コピー対象のプレフィックス */
const GCS_PREFIX = 'articles/';

/** Firebase サービスアカウント鍵ファイルのパス */
const GCS_SERVICE_ACCOUNT_KEY_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  '/home/ubuntu/studio-4200137858-cfe20-firebase-adminsdk-fbsvc-714c9ad487.json';

// ============================================================================
// クライアント初期化
// ============================================================================

function initGCS(): Storage {
  return new Storage({
    keyFilename: GCS_SERVICE_ACCOUNT_KEY_PATH,
  });
}

function initS3(): S3Client {
  return new S3Client({ region: AWS_REGION });
}

// ============================================================================
// MIME タイプ推定
// ============================================================================

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
};

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

// ============================================================================
// メイン処理
// ============================================================================

interface MigrationResult {
  copied: number;
  skipped: number;
  errors: number;
  totalBytes: number;
}

async function migrateFiles(): Promise<void> {
  console.log('='.repeat(60));
  console.log('GCS → S3 メディアファイル移行');
  console.log('='.repeat(60));
  console.log(`  GCS バケット: ${GCS_BUCKET}`);
  console.log(`  GCS プレフィックス: ${GCS_PREFIX}`);
  console.log(`  S3 バケット: ${S3_BUCKET}`);
  console.log(`  リージョン: ${AWS_REGION}`);
  console.log('');

  const gcs = initGCS();
  const s3 = initS3();

  // GCS のファイル一覧を取得
  console.log('GCS ファイル一覧を取得中...');
  const [files] = await gcs.bucket(GCS_BUCKET).getFiles({
    prefix: GCS_PREFIX,
  });

  // ディレクトリエントリを除外（末尾が / のもの）
  const mediaFiles = files.filter((f) => !f.name.endsWith('/'));

  console.log(`  対象ファイル数: ${mediaFiles.length}`);
  console.log('');

  if (mediaFiles.length === 0) {
    console.log('コピー対象のファイルがありません。');
    return;
  }

  const result: MigrationResult = {
    copied: 0,
    skipped: 0,
    errors: 0,
    totalBytes: 0,
  };

  // 順次コピー（並列にすると GCS の rate limit に当たる可能性があるため）
  for (let i = 0; i < mediaFiles.length; i++) {
    const file = mediaFiles[i];
    const s3Key = file.name; // パスをそのまま維持

    const progress = `[${i + 1}/${mediaFiles.length}]`;

    try {
      // GCS からダウンロード
      const [contents] = await file.download();
      const [metadata] = await file.getMetadata();
      const contentType =
        metadata.contentType || getMimeType(file.name);

      // S3 にアップロード
      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: s3Key,
          Body: contents,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        })
      );

      result.copied++;
      result.totalBytes += contents.length;
      console.log(
        `  ${progress} ✓ ${s3Key} (${formatBytes(contents.length)}, ${contentType})`
      );
    } catch (err) {
      result.errors++;
      console.error(`  ${progress} ✗ ${s3Key}: ${err}`);
    }
  }

  // サマリ出力
  console.log('');
  console.log('='.repeat(60));
  console.log('移行結果サマリ');
  console.log('='.repeat(60));
  console.log(`  コピー成功: ${result.copied} 件`);
  console.log(`  エラー: ${result.errors} 件`);
  console.log(`  合計サイズ: ${formatBytes(result.totalBytes)}`);
  console.log('='.repeat(60));

  if (result.errors > 0) {
    process.exit(1);
  }
}

// ============================================================================
// ユーティリティ
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================================
// 実行
// ============================================================================

migrateFiles().catch((err) => {
  console.error('移行中にエラーが発生しました:', err);
  process.exit(1);
});
