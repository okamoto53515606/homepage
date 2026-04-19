/**
 * 有料記事コンテンツ取得 API
 * 
 * GET /api/articles/[slug]/content
 * 
 * 有料記事の本文コンテンツを返します。
 * アクセス権（paid_member / admin）がない場合は 403 を返します。
 * 無料記事の場合はそのままコンテンツを返します。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { getArticleBySlug } from '@/lib/data';
import { renderMarkdownToHtml } from '@/lib/markdown';

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

  // 無料記事はアクセス権チェック不要
  if (article.access === 'free') {
    const html = await renderMarkdownToHtml(article.content);
    return NextResponse.json({
      contentHtml: html,
      canAccess: true,
    });
  }

  // 有料記事: ユーザーのアクセス権を確認
  const user = await getUser();
  const canAccess = user.role === 'paid_member' || user.role === 'admin';

  if (!canAccess) {
    return NextResponse.json(
      { canAccess: false },
      { status: 403 }
    );
  }

  return NextResponse.json({
    contentHtml: await renderMarkdownToHtml(article.content),
    canAccess: true,
  });
}
