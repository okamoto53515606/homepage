/**
 * AI記事生成 API（同期方式）
 *
 * POST /api/admin/articles/generate
 *
 * AI 処理を同期で実行し、完了後に articleId を返す。
 * CloudFront が 60 秒でタイムアウト（504）した場合でも Lambda は動き続け、
 * 記事は正常に保存される。クライアント側ではタイムアウト時に
 * 「記事一覧を確認してください」と案内する。
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminUser } from '@/lib/admin-auth';
import { getGeminiConfig } from '@/lib/gemini-config';
import { logger } from '@/lib/env';
import { getDocClient, Tables } from '@/lib/dynamodb';
import { PutCommand, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { getPublicOrigin } from '@/lib/origin';
import { createGemini } from '@/ai/client';
import { generateArticleDraft } from '@/ai/generate-article';

/**
 * Gemini フローは imageUrls を JSON Schema `format: "uri"` で検証するため
 * 絶対 URL が必須（`/media/...` 相対パスは Parse Error になる）。
 * 相対パスで渡されたものは CloudFront 公開 origin を前置して絶対化する。
 */
function toAbsoluteUrls(urls: string[], origin: string): string[] {
  return urls.map((url) => {
    if (/^https?:\/\//.test(url)) return url;
    if (url.startsWith('/')) return `${origin}${url}`;
    return `${origin}/${url}`;
  });
}

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
    const rawImageUrls = validatedFields.data.imageUrls?.split(',').filter(url => url) || [];
    // Gemini に渡す用は絶対 URL、DB 保存用は相対のまま残す（CloudFront ドメイン変更に強い）
    const absoluteImageUrls = toAbsoluteUrls(rawImageUrls, getPublicOrigin(request));
    const authorId = adminUser.sub || 'admin';
    const access = validatedFields.data.access;
    const contentGoal = validatedFields.data.contentGoal;
    const context = validatedFields.data.context;

    // AI 処理を同期で実行する。
    // CloudFront が 60 秒で 504 を返しても Lambda は動き続けるため、
    // タイムアウト時でも記事は正常に保存される。
    const articleId = await processGeneration({ contentGoal, context, access, imageUrls: rawImageUrls, absoluteImageUrls, authorId });

    return NextResponse.json({
      status: 'ok',
      message: '記事の生成と保存が完了しました。',
      articleId,
    });
  } catch (error) {
    logger.error('[API Error] 記事生成に失敗:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { status: 'error', message: `記事の生成に失敗しました。\n${errorMessage}` },
      { status: 500 }
    );
  }
}

/**
 * AI 記事生成を実行して articleId を返す
 */
async function processGeneration(
  params: { contentGoal: string; context: string; access: 'free' | 'paid'; imageUrls: string[]; absoluteImageUrls: string[]; authorId: string }
): Promise<string> {
  const { apiKey } = await getGeminiConfig();
  // why: genkit 廃止により process.env 汚染・動的 import が不要になった。
  // API キーは createGemini() の引数で直接渡す。
  const model = createGemini(apiKey);

  logger.info('[AI] 記事下書きの生成を開始...');
  const existingTags = await getExistingTags();

  const draft = await generateArticleDraft(model, {
    contentGoal: params.contentGoal,
    context: params.context,
    isPaidContent: params.access === 'paid',
    // Gemini に渡す画像 URL は絶対 URL が必要（CloudFront 公開 URL）
    imageUrls: params.absoluteImageUrls,
    existingTags: existingTags,
  });
  logger.info('[AI] 記事下書きの生成が完了');

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

  logger.info(`[DB] 新規記事(下書き)を作成しました: ${articleId}`);
  return articleId;
}
