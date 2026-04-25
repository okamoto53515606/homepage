/**
 * CloudFront キャッシュ無効化ユーティリティ
 *
 * 記事の公開・更新・削除時に、該当ページの CloudFront キャッシュを
 * Invalidation API で個別パス指定でクリアする。
 *
 * 環境変数 CLOUDFRONT_DISTRIBUTION_ID が未設定の場合は何もしない（ローカル開発用）。
 */

import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { logger } from './env';

const REGION = process.env.AWS_REGION || 'ap-northeast-1';

let _cfClient: CloudFrontClient | null = null;

function getCloudFrontClient(): CloudFrontClient {
  if (!_cfClient) {
    _cfClient = new CloudFrontClient({ region: REGION });
  }
  return _cfClient;
}

/**
 * 指定パスの CloudFront キャッシュを無効化
 *
 * @param paths - 無効化するパスの配列（例: ['/articles/my-slug', '/', '/tags/*']）
 */
export async function invalidateCloudFrontCache(paths: string[]): Promise<void> {
  const distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;
  if (!distributionId) {
    logger.debug('[CloudFront] CLOUDFRONT_DISTRIBUTION_ID 未設定のためスキップ');
    return;
  }

  if (paths.length === 0) return;

  try {
    const client = getCloudFrontClient();
    await client.send(new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: `inv-${Date.now()}`,
        Paths: {
          Quantity: paths.length,
          Items: paths,
        },
      },
    }));
    logger.info(`[CloudFront] Invalidation created: ${paths.join(', ')}`);
  } catch (error) {
    // Invalidation 失敗はログのみ（記事更新自体を失敗させない）
    logger.error('[CloudFront] Invalidation error:', error);
  }
}
