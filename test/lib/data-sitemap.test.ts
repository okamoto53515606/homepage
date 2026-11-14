/**
 * getAllPublishedArticlesForSitemap（sitemap 用の全件取得）の回帰テスト
 *
 * why:
 *   sitemap の網羅性は「GSI を status='published' で引き、LastEvaluatedKey で
 *   全ページ走査する」ことに依存している。ここが
 *   - status 条件を落とす（下書きが検索エンジンに露出する）
 *   - 1 ページで打ち切る（31 件目以降が認識されない）
 *   - 本文（content）まで読む（sitemap には不要で読み取りコストが無駄）
 *   のいずれかに退行すると、画面からは一切気づけない。クエリ条件そのものを assert する。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('@/lib/dynamodb', () => ({
  getDocClient: () => ({ send }),
  Tables: { articles: 'homepage-articles', articleTags: 'homepage-article-tags' },
  Indexes: {
    articlesByStatusCreatedAt: 'articles-by-status-createdAt',
    articlesBySlug: 'articles-by-slug',
  },
}));

// why: data.ts は失敗時に logger.error を呼ぶ。テスト出力を汚さないよう無効化する
vi.mock('@/lib/env', async () => {
  const actual = await vi.importActual<typeof import('@/lib/env')>('@/lib/env');
  return { ...actual, logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
});

beforeEach(() => {
  send.mockReset();
});

describe('getAllPublishedArticlesForSitemap', () => {
  it('status=published で GSI を全ページ走査し、必要な属性だけ射影する', async () => {
    send
      .mockResolvedValueOnce({
        Items: [
          { slug: 'a', updatedAt: '2026-11-02T00:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z' },
          { slug: 'b', createdAt: '2026-10-02T00:00:00.000Z' },
        ],
        LastEvaluatedKey: { id: 'b', status: 'published', createdAt: '2026-10-02T00:00:00.000Z' },
      })
      .mockResolvedValueOnce({
        Items: [{ slug: 'c', createdAt: '2026-10-03T00:00:00.000Z' }],
      });

    const { getAllPublishedArticlesForSitemap } = await import('@/lib/data');
    const result = await getAllPublishedArticlesForSitemap();

    expect(result.map((a) => a.slug)).toEqual(['a', 'b', 'c']);

    expect(send).toHaveBeenCalledTimes(2);

    const [first, second] = send.mock.calls.map((call) => call[0].input);
    expect(first.IndexName).toBe('articles-by-status-createdAt');
    expect(first.KeyConditionExpression).toBe('#status = :status');
    expect(first.ExpressionAttributeValues).toEqual({ ':status': 'published' });
    // 本文を読まない（読み取りコスト削減）
    expect(first.ProjectionExpression).toBe('slug, updatedAt, createdAt');
    // 2 回目は 1 回目の LastEvaluatedKey から続きを読む
    expect(second.ExclusiveStartKey).toEqual({
      id: 'b',
      status: 'published',
      createdAt: '2026-10-02T00:00:00.000Z',
    });
  });

  it('slug 欠損レコードは除外する（壊れた URL を sitemap に出さない）', async () => {
    send.mockResolvedValueOnce({
      Items: [{ slug: 'ok', createdAt: '2026-10-01T00:00:00.000Z' }, { createdAt: '2026-10-02T00:00:00.000Z' }, { slug: '' }],
    });

    const { getAllPublishedArticlesForSitemap } = await import('@/lib/data');
    const result = await getAllPublishedArticlesForSitemap();

    expect(result.map((a) => a.slug)).toEqual(['ok']);
  });

  it('maxItems を超えて取得しない（暴走防止）', async () => {
    send.mockResolvedValue({
      Items: [
        { slug: 'a' },
        { slug: 'b' },
        { slug: 'c' },
      ],
      LastEvaluatedKey: { id: 'c' },
    });

    const { getAllPublishedArticlesForSitemap } = await import('@/lib/data');
    const result = await getAllPublishedArticlesForSitemap(2);

    expect(result).toHaveLength(2);
  });

  it('DynamoDB エラー時は例外を投げず、取得済みの分だけ返す', async () => {
    send.mockRejectedValueOnce(new Error('ProvisionedThroughputExceededException'));

    const { getAllPublishedArticlesForSitemap } = await import('@/lib/data');
    await expect(getAllPublishedArticlesForSitemap()).resolves.toEqual([]);
  });
});
