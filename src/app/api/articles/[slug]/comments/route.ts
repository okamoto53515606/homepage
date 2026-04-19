/**
 * コメント API
 * 
 * GET  /api/articles/[slug]/comments - 記事のコメント一覧を取得
 * POST /api/articles/[slug]/comments - 記事にコメントを投稿（ログイン必要）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { getArticleBySlug, getCommentsForArticle } from '@/lib/data';
import { getRequestInfo, logger } from '@/lib/env';
import { createHash } from 'crypto';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getDocClient, Tables } from '@/lib/dynamodb';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const salt = process.env.DAILY_HASH_SALT || 'default-salt';

/**
 * GET /api/articles/[slug]/comments
 * 記事のコメント一覧を取得
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const article = await getArticleBySlug(slug);
  if (!article) {
    return NextResponse.json(
      { error: '記事が見つかりません。' },
      { status: 404 }
    );
  }

  const comments = await getCommentsForArticle(article.id, 100);

  return NextResponse.json(comments);
}

/**
 * IPアドレスと日付から日替わりハッシュIDを生成する
 */
function generateDailyHash(ip: string): string {
  const date = new Date().toISOString().split('T')[0];
  return createHash('sha256').update(ip + date + salt).digest('hex').substring(0, 8);
}

/**
 * CloudFront ヘッダーからGeo情報を取得する
 */
function getGeoInfoFromHeaders(request: NextRequest): { countryCode: string; regionName: string } {
  const countryCode = request.headers.get('CloudFront-Viewer-Country') || 'N/A';
  const regionName = request.headers.get('CloudFront-Viewer-Country-Region-Name') || 'N/A';
  return { countryCode, regionName };
}

const CommentSchema = z.object({
  content: z.string().min(1, 'コメントは1文字以上で入力してください。').max(1000, 'コメントは1000文字以内で入力してください。'),
  articleId: z.string(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getUser();

  if (!user.isLoggedIn || !user.uid || !user.name) {
    return NextResponse.json(
      { status: 'error', message: 'コメントするにはログインが必要です。' },
      { status: 401 }
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

  const validatedFields = CommentSchema.safeParse(body);

  if (!validatedFields.success) {
    return NextResponse.json(
      { status: 'error', message: validatedFields.error.issues[0].message },
      { status: 400 }
    );
  }

  const { content, articleId } = validatedFields.data;
  const { ip, userAgent } = await getRequestInfo();
  const geoInfo = getGeoInfoFromHeaders(request);

  try {
    const commentId = randomUUID();

    await getDocClient().send(new PutCommand({
      TableName: Tables.comments,
      Item: {
        commentId,
        articleId,
        content,
        userId: user.uid,
        countryCode: geoInfo.countryCode,
        region: geoInfo.regionName,
        dailyHashId: generateDailyHash(ip),
        ipAddress: ip,
        userAgent,
        createdAt: new Date().toISOString(),
      },
    }));

    const { slug } = await params;
    revalidatePath(`/articles/${slug}`);

    return NextResponse.json({ status: 'success', message: 'コメントを投稿しました。' });
  } catch (error) {
    logger.error('[API] コメントの投稿に失敗:', error);
    return NextResponse.json(
      { status: 'error', message: 'コメントの投稿中にサーバーエラーが発生しました。' },
      { status: 500 }
    );
  }
}
