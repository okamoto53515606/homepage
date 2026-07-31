/**
 * AI記事修正 API（同期方式）
 *
 * POST /api/admin/articles/[id]/revise
 *
 * AI 処理を同期で実行し、完了後にレスポンスを返す。
 * CloudFront が 60 秒でタイムアウト（504）した場合でも Lambda は動き続け、
 * 記事は正常に保存される。クライアント側ではタイムアウト時に
 * 「しばらくしてからページを更新してください」と案内する。
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
import { getPublicOrigin } from '@/lib/origin';
import { createGemini } from '@/ai/client';
import { reviseArticleDraft } from '@/ai/revise-article';

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
  // why: 記事修正時に追加アップロードされた画像URLを受け取る（カンマ区切り文字列）。
  // generate/route.ts と同じ形式で、API 側でパース・絶対URL化する。
  imageUrls: z.string().optional(),
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

  const { revisionRequest, imageUrls: newImageUrlsRaw } = validatedFields.data;

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

    // AI 処理を同期で実行する。
    // CloudFront が 60 秒で 504 を返しても Lambda は動き続けるため、
    // タイムアウト時でも記事の修正は正常に保存される。
    const publicOrigin = getPublicOrigin(request);
    await processRevision(articleId, revisionRequest, articleResult.Item, publicOrigin, newImageUrlsRaw ?? '');

    return NextResponse.json({
      status: 'ok',
      message: 'AIによる記事の修正が完了しました。',
    });
  } catch (error) {
    logger.error(`[Admin] 記事修正に失敗 (ID: ${articleId}):`, error);
    const errorMessage = error instanceof Error ? error.message : '不明なサーバーエラーです。';
    return NextResponse.json(
      { status: 'error', message: `サーバーエラー: ${errorMessage}` },
      { status: 500 }
    );
  }
}

/**
 * AI 記事修正を実行する
 */
async function processRevision(
  articleId: string,
  revisionRequest: string,
  currentArticle: Record<string, unknown>,
  publicOrigin: string,
  newImageUrlsRaw: string
) {
  const { apiKey } = await getGeminiConfig();
  // why: genkit 廃止により process.env 汚染・動的 import が不要になった。
  // API キーは createGemini() の引数で直接渡す。
  const model = createGemini(apiKey);

  // 既存 imageAssets に今回追加アップロードされた画像を統合して AI に渡す。
  // DB 保存は相対パスのまま。AI 用に絶対 URL 化するのは処理直前のみ。
  const existingRawUrls = ((currentArticle.imageAssets || []) as Array<{ url: string }>).map(asset => asset.url);
  const newRawUrls = newImageUrlsRaw.split(',').filter(u => u.trim());
  const imageUrls = toAbsoluteUrls([...existingRawUrls, ...newRawUrls], publicOrigin);
  const existingTags = await getExistingTags();

  logger.info(`[AI] 記事修正を開始 (ID: ${articleId})`);  

    const revisedDraft = await reviseArticleDraft(model, {
      currentTitle: currentArticle.title as string,
      currentContent: currentArticle.content as string,
      revisionRequest: revisionRequest,
      imageUrls: imageUrls,
      existingTags: existingTags,
    });

    logger.info(`[AI] 記事修正が完了 (ID: ${articleId})`);  

    const docClient = getDocClient();
    const newTags = revisedDraft.revisedTags || [];

    const now = new Date().toISOString();

    // 新規アップロード画像を imageAssets にマージして保存。
    // 新規がゼロでも既存 assets をそのまま書き戻すことで整合性を保つ。
    const existingAssets = (currentArticle.imageAssets || []) as Array<{ url: string; uploadedAt: string }>;
    const mergedAssets = [
      ...existingAssets,
      ...newRawUrls.map(url => ({ url, uploadedAt: now })),
    ];

    await docClient.send(new UpdateCommand({
      TableName: Tables.articles,
      Key: { id: articleId },
      UpdateExpression: 'SET title = :title, content = :content, excerpt = :excerpt, tags = :tags, imageAssets = :imageAssets, updatedAt = :now',
      ExpressionAttributeValues: {
        ':title': revisedDraft.revisedTitle,
        ':content': revisedDraft.revisedContent,
        ':excerpt': revisedDraft.revisedExcerpt,
        ':tags': newTags,
        ':imageAssets': mergedAssets,
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
}
