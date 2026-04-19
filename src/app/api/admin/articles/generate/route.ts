/**
 * AI記事生成 API
 * 
 * POST /api/admin/articles/generate
 * 
 * AIで記事下書きを生成し、DynamoDBに保存します。
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateArticleDraft } from '@/ai/flows/generate-article-draft';
import { getUser } from '@/lib/auth';
import { logger } from '@/lib/env';
import { getDocClient, Tables } from '@/lib/dynamodb';
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

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
  const user = await getUser();
  if (user.role !== 'admin') {
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
    logger.info('[AI] 記事下書きの生成を開始...');
    const imageUrls = validatedFields.data.imageUrls?.split(',').filter(url => url) || [];
    const existingTags = await getExistingTags();

    const draft = await generateArticleDraft({
      contentGoal: validatedFields.data.contentGoal,
      context: validatedFields.data.context,
      isPaidContent: validatedFields.data.access === 'paid',
      imageUrls: imageUrls,
      existingTags: existingTags,
    });
    logger.info('[AI] 記事下書きの生成が完了しました。');

    const docClient = getDocClient();
    const articleId = randomUUID();

    const slug = (draft.title || `draft-${Date.now()}`)
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const imageAssets = imageUrls.map(url => ({
      url: url,
      uploadedAt: new Date().toISOString(),
    }));

    const now = new Date().toISOString();
    const tags = draft.tags || [];

    await docClient.send(new PutCommand({
      TableName: Tables.articles,
      Item: {
        articleId,
        title: draft.title || '無題の記事',
        content: draft.markdownContent,
        excerpt: draft.excerpt,
        tags,
        slug,
        status: 'draft',
        access: validatedFields.data.access,
        imageAssets,
        authorId: user.uid,
        createdAt: now,
        updatedAt: now,
      },
    }));

    // article_tags テーブルにタグを書き込み
    for (const tag of tags) {
      await docClient.send(new PutCommand({
        TableName: Tables.articleTags,
        Item: {
          articleId,
          tag,
          status: 'draft',
          createdAt: now,
        },
      }));
    }

    logger.info(`[DB] 新規記事(下書き)を作成しました: ${articleId}`);

    return NextResponse.json({
      status: 'success',
      message: '記事の生成と保存が完了しました。',
      articleId,
    });
  } catch (error) {
    logger.error('[API Error] 記事の生成または保存に失敗:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { status: 'error', message: `記事の生成または保存中にサーバーエラーが発生しました。\n${errorMessage}` },
      { status: 500 }
    );
  }
}
