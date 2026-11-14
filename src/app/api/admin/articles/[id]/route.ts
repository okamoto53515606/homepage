/**
 * 記事更新 API
 * 
 * PUT /api/admin/articles/[id]  - 記事のステータス・アクセスレベル更新
 * GET /api/admin/articles/[id]  - 記事の更新状態（updatedAt）取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAdminUser } from '@/lib/admin-auth';
import { logger } from '@/lib/env';
import { getDocClient, Tables } from '@/lib/dynamodb';
import { UpdateCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { invalidateCloudFrontCache } from '@/lib/cloudfront';

const UpdateArticleSchema = z.object({
  status: z.enum(['draft', 'published']),
  access: z.enum(['free', 'paid']),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminUser = await getAdminUser();
  if (!adminUser.isAuthenticated) {
    return NextResponse.json(
      { status: 'error', message: '管理者権限がありません。' },
      { status: 403 }
    );
  }

  const { id: articleId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'リクエストボディが不正です。' },
      { status: 400 }
    );
  }

  const validatedFields = UpdateArticleSchema.safeParse(body);

  if (!validatedFields.success) {
    const errorMessages = validatedFields.error.issues.map(issue => issue.message).join('\n');
    return NextResponse.json(
      { status: 'error', message: `入力エラー: ${errorMessages}` },
      { status: 400 }
    );
  }

  try {
    const docClient = getDocClient();

    await docClient.send(new UpdateCommand({
      TableName: Tables.articles,
      Key: { id: articleId },
      UpdateExpression: 'SET #status = :status, access = :access, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': validatedFields.data.status,
        ':access': validatedFields.data.access,
        ':now': new Date().toISOString(),
      },
    }));

    // slug と tags を取得して revalidate / article_tags 同期に利用
    const articleResult = await docClient.send(new GetCommand({
      TableName: Tables.articles,
      Key: { id: articleId },
      ProjectionExpression: 'slug, tags',
    }));
    const articleSlug = articleResult.Item?.slug;
    const articleTags: string[] = (articleResult.Item?.tags as string[]) ?? [];

    // why: getTags() / getArticlesByTag() は article_tags.status='published' で絞り込むため、
    //      articles 側のステータスだけ更新すると公開済みでもハンバーガーやタグページに
    //      出てこない（タグカウントが 0 のまま）。ここで対応する全 article_tags 行の
    //      status を同期する。Query は tag PK 配下の SK に対して実行し、対象記事の
    //      行だけ UpdateCommand で更新する（PutCommand での再投入は createdAt#articleId
    //      を再構築するコストが高く、レースコンディションも招きやすいため避ける）。
    for (const tag of articleTags) {
      const tagResult = await docClient.send(new QueryCommand({
        TableName: Tables.articleTags,
        KeyConditionExpression: 'tag = :t',
        ExpressionAttributeValues: { ':t': tag },
        ProjectionExpression: 'tag, #ck, articleId',
        ExpressionAttributeNames: { '#ck': 'createdAt#articleId' },
      }));
      for (const item of tagResult.Items ?? []) {
        if (item.articleId !== articleId) continue;
        await docClient.send(new UpdateCommand({
          TableName: Tables.articleTags,
          Key: {
            tag: item.tag,
            'createdAt#articleId': item['createdAt#articleId'],
          },
          UpdateExpression: 'SET #status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': validatedFields.data.status },
        }));
      }
    }

    revalidatePath(`/admin/articles/edit/${articleId}`);
    revalidatePath('/admin/articles');
    if (articleSlug) {
      revalidatePath(`/articles/${articleSlug}`);
      await invalidateCloudFrontCache([`/articles/${articleSlug}`, '/', '/tags/*', '/sitemap.xml']);
    } else {
      await invalidateCloudFrontCache(['/', '/tags/*', '/sitemap.xml']);
    }

    logger.info(`[Admin] 記事のステータス/アクセスを更新しました: ${articleId}`);

    return NextResponse.json({
      status: 'success',
      message: '公開ステータスが正常に更新されました。',
    });
  } catch (error) {
    logger.error(`[Admin] 記事の更新に失敗 (ID: ${articleId}):`, error);
    const errorMessage = error instanceof Error ? error.message : '不明なサーバーエラーです。';
    return NextResponse.json(
      { status: 'error', message: `サーバーエラー: ${errorMessage}` },
      { status: 500 }
    );
  }
}

/**
 * 記事の更新状態取得 API
 *
 * GET /api/admin/articles/[id] → { status: 'ok', updatedAt }
 *
 * why: AI 記事修正は CloudFront の origin response timeout（60 秒）で 504 になるが、
 *      Lambda 側の処理はそのまま継続する（最大 15 分）。クライアントはレスポンスを
 *      受け取れないため、このエンドポイントをポーリングして updatedAt の変化を
 *      完了シグナルとして扱い、プレビューを自動更新する。
 *      ポーリング頻度を上げても負荷・転送量が増えないよう、本文（content）は返さず
 *      updatedAt だけを射影する。status は DynamoDB の予約語のため射影しない。
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminUser = await getAdminUser();
  if (!adminUser.isAuthenticated) {
    return NextResponse.json(
      { status: 'error', message: '管理者権限がありません。' },
      { status: 403 }
    );
  }

  const { id: articleId } = await params;

  try {
    const docClient = getDocClient();
    const result = await docClient.send(new GetCommand({
      TableName: Tables.articles,
      Key: { id: articleId },
      ProjectionExpression: 'updatedAt',
    }));

    if (!result.Item) {
      return NextResponse.json(
        { status: 'error', message: '対象の記事が見つかりません。' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: 'ok',
      updatedAt: (result.Item.updatedAt as string) ?? null,
    });
  } catch (error) {
    logger.error(`[Admin] 記事の更新状態取得に失敗 (ID: ${articleId}):`, error);
    return NextResponse.json(
      { status: 'error', message: '記事の状態を取得できませんでした。' },
      { status: 500 }
    );
  }
}
