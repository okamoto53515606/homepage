/**
 * AI記事修正 API
 * 
 * POST /api/admin/articles/[id]/revise
 * 
 * AIで記事を修正します。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { reviseArticleDraft } from '@/ai/flows/revise-article-draft';
import { logger } from '@/lib/env';

const ReviseArticleSchema = z.object({
  revisionRequest: z.string().min(5, '修正依頼は5文字以上で入力してください。'),
});

/**
 * 既存の全タグをFirestoreから取得する
 */
async function getExistingTags(): Promise<string[]> {
  try {
    const db = getAdminDb();
    const articlesSnapshot = await db.collection('articles').select('tags').get();
    const allTags = articlesSnapshot.docs.flatMap(doc => doc.data().tags || []);
    const uniqueTags = [...new Set(allTags)];
    logger.debug(`[Tags] 取得した既存のユニークタグ: ${uniqueTags.length}件`);
    return uniqueTags;
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
    const db = getAdminDb();
    const articleRef = db.collection('articles').doc(articleId);
    const doc = await articleRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { status: 'error', message: '対象の記事が見つかりません。' },
        { status: 404 }
      );
    }

    const currentArticle = doc.data()!;
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

    await articleRef.update({
      title: revisedDraft.revisedTitle,
      content: revisedDraft.revisedContent,
      excerpt: revisedDraft.revisedExcerpt,
      teaserContent: revisedDraft.revisedTeaserContent,
      tags: revisedDraft.revisedTags,
      updatedAt: FieldValue.serverTimestamp(),
    });

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
