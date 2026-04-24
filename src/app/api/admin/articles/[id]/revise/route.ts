/**
 * AI記事修正 API（非同期ジョブ方式）
 * 
 * POST /api/admin/articles/[id]/revise
 * 
 * CloudFront の 60 秒タイムアウト対策として、ジョブを作成し即座に jobId を返す。
 * クライアントは GET /api/admin/jobs/{jobId} でポーリングする。
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAdminUser } from '@/lib/admin-auth';
import { getGeminiConfig } from '@/lib/gemini-config';
import { logger } from '@/lib/env';
import { getDocClient, Tables } from '@/lib/dynamodb';
import { GetCommand, UpdateCommand, PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { invalidateCloudFrontCache } from '@/lib/cloudfront';
import { createJob, completeJob, failJob } from '@/lib/jobs';
import { getPublicOrigin } from '@/lib/origin';

/**
 * Gemini フローは imageUrls を JSON Schema `format: "uri"` で検証するため
 * 絶対 URL が必須。imageAssets.url は DB にドメイン移行耐性のため相対パスで
 * 保存されているので、AI に渡す前に CloudFront 公開 origin を前置して絶対化する。
 */
function toAbsoluteUrls(urls: string[], origin: string): string[] {
  return urls.map((url) => {
    if (/^https?:\/\//.test(url)) return url;
    if (url.startsWith('/')) return `${origin}${url}`;
    return `${origin}/${url}`;
  });
}

const ReviseArticleSchema = z.object({
  revisionRequest: z.string().min(5, '修正依頼は5文字以上で入力してください。'),
});

/**
 * 既存の全タグをDynamoDBから取得する
 */
async function getExistingTags(): Promise<string[]> {
  try {
    const docClient = getDocClient();
    const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
    const result = await docClient.send(new ScanCommand({
      TableName: Tables.articles,
      ProjectionExpression: 'tags',
    }));
    const allTags = (result.Items || []).flatMap(item => item.tags || []);
    return [...new Set(allTags)];
  } catch (error) {
    logger.error('[Tags] 既存タグの取得に失敗:', error);
    return [];
  }
}

export async function POST(
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

  const validatedFields = ReviseArticleSchema.safeParse(body);

  if (!validatedFields.success) {
    return NextResponse.json(
      { status: 'error', message: '入力内容が正しくありません。' },
      { status: 400 }
    );
  }

  const { revisionRequest } = validatedFields.data;

  try {
    const docClient = getDocClient();

    const articleResult = await docClient.send(new GetCommand({
      TableName: Tables.articles,
      Key: { id: articleId },
    }));

    if (!articleResult.Item) {
      return NextResponse.json(
        { status: 'error', message: '対象の記事が見つかりません。' },
        { status: 404 }
      );
    }

    // ジョブを作成し、即座に jobId を返す
    const jobId = await createJob('revise');

    // why: バックグラウンドには request が渡せないので、POST ハンドラ段階で
    //      CloudFront 公開 origin を解決しておく。
    const publicOrigin = getPublicOrigin(request);

    // バックグラウンドで AI 処理を実行（await しない）
    processRevision(jobId, articleId, revisionRequest, articleResult.Item, publicOrigin).catch(error => {
      logger.error(`[AI] バックグラウンド修正エラー (jobId: ${jobId}):`, error);
    });

    return NextResponse.json({
      status: 'accepted',
      message: 'ジョブを開始しました。',
      jobId,
    });
  } catch (error) {
    logger.error(`[Admin] ジョブの作成に失敗 (ID: ${articleId}):`, error);
    const errorMessage = error instanceof Error ? error.message : '不明なサーバーエラーです。';
    return NextResponse.json(
      { status: 'error', message: `サーバーエラー: ${errorMessage}` },
      { status: 500 }
    );
  }
}

/**
 * バックグラウンドで AI 記事修正を実行する
 */
async function processRevision(
  jobId: string,
  articleId: string,
  revisionRequest: string,
  currentArticle: Record<string, unknown>,
  publicOrigin: string
) {
  try {
    const { apiKey } = await getGeminiConfig();
    process.env.GEMINI_API_KEY = apiKey;
    const { reviseArticleDraft } = await import('@/ai/flows/revise-article-draft');

    const rawImageUrls = ((currentArticle.imageAssets || []) as Array<{ url: string }>).map(asset => asset.url);
    const imageUrls = toAbsoluteUrls(rawImageUrls, publicOrigin);
    const existingTags = await getExistingTags();

    logger.info(`[AI] 記事修正を開始 (ID: ${articleId}, jobId: ${jobId})`);

    const revisedDraft = await reviseArticleDraft({
      currentTitle: currentArticle.title as string,
      currentContent: currentArticle.content as string,
      revisionRequest: revisionRequest,
      imageUrls: imageUrls,
      existingTags: existingTags,
    });

    logger.info(`[AI] 記事修正が完了 (ID: ${articleId}, jobId: ${jobId})`);

    const docClient = getDocClient();
    const newTags = revisedDraft.revisedTags || [];

    const now = new Date().toISOString();

    await docClient.send(new UpdateCommand({
      TableName: Tables.articles,
      Key: { id: articleId },
      UpdateExpression: 'SET title = :title, content = :content, excerpt = :excerpt, tags = :tags, updatedAt = :now',
      ExpressionAttributeValues: {
        ':title': revisedDraft.revisedTitle,
        ':content': revisedDraft.revisedContent,
        ':excerpt': revisedDraft.revisedExcerpt,
        ':tags': newTags,
        ':now': now,
      },
    }));

    // 既存の article-tags を削除（旧タグでQuery）
    const oldTags: string[] = (currentArticle.tags as string[]) || [];
    for (const tag of oldTags) {
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

    // 新しい article-tags を追加
    for (const tag of newTags) {
      await docClient.send(new PutCommand({
        TableName: Tables.articleTags,
        Item: {
          tag,
          'createdAt#articleId': `${currentArticle.createdAt as string}#${articleId}`,
          articleId,
          status: currentArticle.status as string,
          createdAt: currentArticle.createdAt as string,
        },
      }));
    }

    revalidatePath(`/admin/articles/edit/${articleId}`);

    const invalidationPaths = ['/', '/tags/*'];
    if (currentArticle.slug) {
      invalidationPaths.push(`/articles/${currentArticle.slug}`);
    }
    await invalidateCloudFrontCache(invalidationPaths);

    await completeJob(jobId, { articleId, message: 'AIによる記事の修正が完了しました。' });
  } catch (error) {
    logger.error(`[AI] 記事修正失敗 (jobId: ${jobId}):`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    await failJob(jobId, errorMessage);
  }
}
