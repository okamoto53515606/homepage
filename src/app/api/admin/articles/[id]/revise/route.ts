/**
 * AI記事修正 API
 * 
 * POST /api/admin/articles/[id]/revise
 * 
 * AIで記事を修正します。
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { reviseArticleDraft } from '@/ai/flows/revise-article-draft';
import { logger } from '@/lib/env';
import { getDocClient, Tables } from '@/lib/dynamodb';
import { GetCommand, UpdateCommand, PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

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
  const user = await getUser();
  if (user.role !== 'admin') {
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
      Key: { articleId },
    }));

    if (!articleResult.Item) {
      return NextResponse.json(
        { status: 'error', message: '対象の記事が見つかりません。' },
        { status: 404 }
      );
    }

    const currentArticle = articleResult.Item;
    const imageUrls = (currentArticle.imageAssets || []).map((asset: { url: string }) => asset.url);
    const existingTags = await getExistingTags();

    logger.info(`[AI] 記事修正を開始 (ID: ${articleId})`);

    const revisedDraft = await reviseArticleDraft({
      currentTitle: currentArticle.title,
      currentContent: currentArticle.content,
      revisionRequest: revisionRequest,
      imageUrls: imageUrls,
      existingTags: existingTags,
    });

    logger.info(`[AI] 記事修正が完了 (ID: ${articleId})`);

    const newTags = revisedDraft.revisedTags || [];

    await docClient.send(new UpdateCommand({
      TableName: Tables.articles,
      Key: { articleId },
      UpdateExpression: 'SET title = :title, content = :content, excerpt = :excerpt, tags = :tags, updatedAt = :now',
      ExpressionAttributeValues: {
        ':title': revisedDraft.revisedTitle,
        ':content': revisedDraft.revisedContent,
        ':excerpt': revisedDraft.revisedExcerpt,
        ':tags': newTags,
        ':now': new Date().toISOString(),
      },
    }));

    // article_tags の同期: 既存を削除して再作成
    const existingTagsResult = await docClient.send(new QueryCommand({
      TableName: Tables.articleTags,
      KeyConditionExpression: 'articleId = :aid',
      ExpressionAttributeValues: { ':aid': articleId },
    }));

    if (existingTagsResult.Items) {
      for (const item of existingTagsResult.Items) {
        await docClient.send(new DeleteCommand({
          TableName: Tables.articleTags,
          Key: { articleId: item.articleId, tag: item.tag },
        }));
      }
    }

    for (const tag of newTags) {
      await docClient.send(new PutCommand({
        TableName: Tables.articleTags,
        Item: {
          articleId,
          tag,
          status: currentArticle.status,
          createdAt: currentArticle.createdAt,
        },
      }));
    }

    revalidatePath(`/admin/articles/edit/${articleId}`);

    return NextResponse.json({
      status: 'success',
      message: 'AIによる記事の修正が完了しました。ページが自動的に更新されます。',
    });
  } catch (error) {
    logger.error(`[Admin] AIによる記事修正に失敗 (ID: ${articleId}):`, error);
    const errorMessage = error instanceof Error ? error.message : '不明なサーバーエラーです。';
    return NextResponse.json(
      { status: 'error', message: `サーバーエラー: ${errorMessage}` },
      { status: 500 }
    );
  }
}
