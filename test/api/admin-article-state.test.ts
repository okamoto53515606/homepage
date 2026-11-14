/**
 * GET /api/admin/articles/[id] （更新状態取得）の契約テスト
 *
 * why:
 *   AI 記事修正は CloudFront の origin response timeout（60 秒）で 504 になるが、
 *   Lambda 側の処理は最大 15 分継続する。クライアントはレスポンスで完了を知れないため
 *   updatedAt の変化をポーリングして完了を検知し、プレビューを自動更新している。
 *   この仕組みは「updatedAt をそのまま返す」ことが前提なので、以下を回帰テストで固定する。
 *
 *   - updatedAt のみを射影して返す（content を返さない = ポーリングを軽く保つ）
 *   - 記事が存在しない → 404
 *   - DynamoDB 例外 → 500 かつ内部エラーメッセージを露出しない
 *   - 未認証 → 403（admin-auth-gate.test.ts 側で検証）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// vi.mock のファクトリは hoist されるため、参照する変数は vi.hoisted で先に確保する。
const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('@/lib/admin-auth', () => ({
  getAdminUser: vi.fn(async () => ({
    isAuthenticated: true,
    email: 'admin@test.local',
    sub: 'admin-sub',
  })),
}));

vi.mock('@/lib/dynamodb', () => ({
  getDocClient: vi.fn(() => ({ send })),
  Tables: { articles: 'articles', articleTags: 'article_tags' },
}));

vi.mock('@/lib/cloudfront', () => ({
  invalidateCloudFrontCache: vi.fn(async () => undefined),
}));

vi.mock('@/lib/env', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const params = Promise.resolve({ id: 'art-1' });

function makeRequest() {
  return new NextRequest('https://example.com/api/admin/articles/art-1');
}

beforeEach(() => {
  send.mockReset();
});

describe('GET /api/admin/articles/[id]', () => {
  it('updatedAt だけを射影して返す（content を返さない）', async () => {
    send.mockResolvedValueOnce({ Item: { updatedAt: '2026-11-14T01:02:03.000Z' } });

    const { GET } = await import('@/app/api/admin/articles/[id]/route');
    const res = await GET(makeRequest(), { params });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: 'ok',
      updatedAt: '2026-11-14T01:02:03.000Z',
    });

    const command = send.mock.calls[0][0];
    expect(command.input.ProjectionExpression).toBe('updatedAt');
  });

  it('記事が存在しない → 404', async () => {
    send.mockResolvedValueOnce({ Item: undefined });

    const { GET } = await import('@/app/api/admin/articles/[id]/route');
    const res = await GET(makeRequest(), { params });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.status).toBe('error');
  });

  it('DynamoDB 例外 → 500 かつ内部エラー文言を露出しない', async () => {
    send.mockRejectedValueOnce(new Error('secret-table-name exploded'));

    const { GET } = await import('@/app/api/admin/articles/[id]/route');
    const res = await GET(makeRequest(), { params });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.status).toBe('error');
    expect(JSON.stringify(body)).not.toContain('secret-table-name');
  });
});
