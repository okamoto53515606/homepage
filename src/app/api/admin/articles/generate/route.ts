/**
 * AI記事生成 API（非同期ジョブ方式）
 * 
 * POST /api/admin/articles/generate
 * 
 * CloudFront の 60 秒タイムアウト対策として、ジョブを作成し即座に jobId を返す。
 * AI 処理はバックグラウンドで実行し、結果は jobs テーブルに保存される。
 * クライアントは GET /api/admin/jobs/{jobId} でポーリングする。
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminUser } from '@/lib/admin-auth';
import { getGeminiConfig } from '@/lib/gemini-config';
import { logger } from '@/lib/env';
import { getDocClient, Tables } from '@/lib/dynamodb';
import { PutCommand, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { createJob, completeJob, failJob } from '@/lib/jobs';

const ArticleSchema = z.object({
  contentGoal: z.string().min(10, { message: 'コンテンツの目標は10文字以上で入力してください。' }),
  context: z.string().min(10, { message: 'コンテキストは10文字以上で入力してください。' }),
  access: z.enum(['free', 'paid'], { message: 'アクセスレベルを選択してください。'}),
  imageUrls: z.string().optional(),
});

/**
 * 既存の全タグをDynamoDBから取得する
 */
async function getExistingTags(): Promise<string[]> {
  try {
    const docClient = getDocClient();
    const result = await docClient.send(new ScanCommand({
      TableName: Tables.articles,
      ProjectionExpression: 'tags',
    }));
    const allTags = (result.Items || []).flatMap(item => item.tags || []);
    const uniqueTags = [...new Set(allTags)];
    logger.debug(`[Tags] 取得した既存のユニークタグ: ${uniqueTags.length}件`);
    return uniqueTags;
  } catch (error) {
    logger.error('[Tags] 既存タグの取得に失敗:', error);
    return [];
  }
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

  const validatedFields = ArticleSchema.safeParse(body);

  if (!validatedFields.success) {
    const issues = validatedFields.error.issues.map((issue) => issue.message);
    return NextResponse.json(
      {
        status: 'error',
        message: '入力内容を確認してください。',
        issues,
      },
      { status: 400 }
    );
  }

  try {
    const imageUrls = validatedFields.data.imageUrls?.split(',').filter(url => url) || [];
    const authorId = adminUser.sub || 'admin';
    const access = validatedFields.data.access;
    const contentGoal = validatedFields.data.contentGoal;
    const context = validatedFields.data.context;

    // ジョブを作成し、即座に jobId を返す
    const jobId = await createJob('generate');

    // バックグラウンドで AI 処理を実行（await しない）
    processGeneration(jobId, { contentGoal, context, access, imageUrls, authorId }).catch(error => {
      logger.error(`[AI] バックグラウンド生成エラー (jobId: ${jobId}):`, error);
    });

    return NextResponse.json({
      status: 'accepted',
      message: 'ジョブを開始しました。',
      jobId,
    });
  } catch (error) {
    logger.error('[API Error] ジョブの作成に失敗:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { status: 'error', message: `ジョブの作成に失敗しました。\n${errorMessage}` },
      { status: 500 }
    );
  }
}

/**
 * バックグラウンドで AI 記事生成を実行する
 */
async function processGeneration(
  jobId: string,
  params: { contentGoal: string; context: string; access: 'free' | 'paid'; imageUrls: string[]; authorId: string }
) {
  try {
    const { apiKey } = await getGeminiConfig();
    process.env.GEMINI_API_KEY = apiKey;
    const { generateArticleDraft } = await import('@/ai/flows/generate-article-draft');

    logger.info(`[AI] 記事下書きの生成を開始 (jobId: ${jobId})...`);
    const existingTags = await getExistingTags();

    const draft = await generateArticleDraft({
      contentGoal: params.contentGoal,
      context: params.context,
      isPaidContent: params.access === 'paid',
      imageUrls: params.imageUrls,
      existingTags: existingTags,
    });
    logger.info(`[AI] 記事下書きの生成が完了 (jobId: ${jobId})`);

    const docClient = getDocClient();
    const articleId = randomUUID();

    // slug の重複チェック
    let slug = draft.slug || `draft-${Date.now()}`;
    const slugCheck = await docClient.send(new QueryCommand({
      TableName: Tables.articles,
      IndexName: 'articles-by-slug',
      KeyConditionExpression: 'slug = :s',
      ExpressionAttributeValues: { ':s': slug },
      Limit: 1,
    }));
    if (slugCheck.Items && slugCheck.Items.length > 0) {
      const dateSuffix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      slug = `${slug}-${dateSuffix}`;
    }

    const imageAssets = params.imageUrls.map(url => ({
      url: url,
      uploadedAt: new Date().toISOString(),
    }));

    const now = new Date().toISOString();
    const tags = draft.tags || [];

    await docClient.send(new PutCommand({
      TableName: Tables.articles,
      Item: {
        id: articleId,
        title: draft.title || '無題の記事',
        content: draft.markdownContent,
        excerpt: draft.excerpt,
        tags,
        slug,
        status: 'draft',
        access: params.access,
        imageAssets,
        authorId: params.authorId,
        createdAt: now,
        updatedAt: now,
      },
    }));

    for (const tag of tags) {
      await docClient.send(new PutCommand({
        TableName: Tables.articleTags,
        Item: {
          tag,
          'createdAt#articleId': `${now}#${articleId}`,
          articleId,
          status: 'draft',
          createdAt: now,
        },
      }));
    }

    logger.info(`[DB] 新規記事(下書き)を作成しました: ${articleId} (jobId: ${jobId})`);
    await completeJob(jobId, { articleId, message: '記事の生成と保存が完了しました。' });
  } catch (error) {
    logger.error(`[AI] 記事生成失敗 (jobId: ${jobId}):`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    await failJob(jobId, errorMessage);
  }
}
