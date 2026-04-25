/**
 * 記事管理 API
 *
 * DELETE /api/admin/articles?id=<articleId>
 *
 * 管理者が記事を削除します。
 *
 * 【なぜ body ではなく URL クエリで ID を受けるか】
 * CloudFront OAC + Lambda Function URL の経路では、body 付き DELETE の
 * SHA256 ハッシュがクライアントと OAC 署名で一致しないケースが発生し、
 * "signature does not match" 拒否になる。body 無し（空 body ハッシュ）で
 * 済ませられる形に寄せることでこの経路の不安定性を回避する。
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAdminUser } from '@/lib/admin-auth';
import { logger } from '@/lib/env';
import { getDocClient, Tables } from '@/lib/dynamodb';
import { DeleteCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { invalidateCloudFrontCache } from '@/lib/cloudfront';

export async function DELETE(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser.isAuthenticated) {
    return NextResponse.json(
      { status: 'error', message: '管理者権限がありません。' },
      { status: 403 }
    );
  }

  const articleId = request.nextUrl.searchParams.get('id') || '';
  if (!articleId) {
    return NextResponse.json(
      { status: 'error', message: '記事IDが指定されていません。' },
      { status: 400 }
    );
  }

  try {
    const docClient = getDocClient();

    // slug を取得（CloudFront invalidation 用）
    const articleResult = await docClient.send(new GetCommand({
      TableName: Tables.articles,
      Key: { id: articleId },
      ProjectionExpression: 'slug, tags',
    }));
    const articleSlug = articleResult.Item?.slug;
    const articleTags: string[] = articleResult.Item?.tags || [];

    // 記事を削除
    await docClient.send(new DeleteCommand({
      TableName: Tables.articles,
      Key: { id: articleId },
    }));

    // 関連する article_tags を削除
    for (const tag of articleTags) {
      const tagResult = await docClient.send(new QueryCommand({
        TableName: Tables.articleTags,
        KeyConditionExpression: 'tag = :t',
        ExpressionAttributeValues: { ':t': tag },
      }));
      if (tagResult.Items) {
        for (const item of tagResult.Items) {
          if (item.articleId === articleId) {
            await docClient.send(new DeleteCommand({
              TableName: Tables.articleTags,
              Key: { tag: item.tag, 'createdAt#articleId': item['createdAt#articleId'] },
            }));
          }
        }
      }
    }

    logger.info(`[Admin] 記事を削除しました: ${articleId}`);
    revalidatePath('/admin/articles');

    // CloudFront キャッシュ無効化
    const invalidationPaths = ['/', '/tags/*'];
    if (articleSlug) {
      invalidationPaths.push(`/articles/${articleSlug}`);
    }
    await invalidateCloudFrontCache(invalidationPaths);

    return NextResponse.json({ status: 'success', message: '記事を削除しました。' });
  } catch (error) {
    logger.error(`[Admin] 記事の削除に失敗 (ID: ${articleId}):`, error);
    return NextResponse.json(
      { status: 'error', message: '記事の削除中にサーバーエラーが発生しました。' },
      { status: 500 }
    );
  }
}
