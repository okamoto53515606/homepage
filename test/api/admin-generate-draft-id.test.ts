/**
 * POST /api/admin/articles/generate の draftId（クライアント発行の記事 ID）の契約テスト
 *
 * why:
 *   記事生成は CloudFront の 60 秒タイムアウトでレスポンスが届かないことがある。
 *   そのときクライアントは「自分が送った draftId の記事ができたか」を
 *   GET /api/admin/articles/[id] でポーリングして完了を検知し、編集画面へ移動する。
 *   この仕組みは「サーバーが指定された draftId を PK として保存する」ことが前提なので、
 *   以下を回帰テストで固定する。
 *
 *   - 指定された draftId がそのまま記事 ID になる（= クライアントが完了を検知できる）
 *   - UUID でない draftId は 400（PK を任意文字列で汚染させない）
 *   - draftId 省略時は従来どおりサーバー側で採番する（後方互換）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('@/lib/admin-auth', () => ({
  getAdminUser: vi.fn(async () => ({
    isAuthenticated: true,
    email: 'admin@test.local',
    sub: 'admin-sub',
  })),
}));

vi.mock('@/lib/gemini-config', () => ({
  getGeminiConfig: vi.fn(async () => ({ apiKey: 'test-key' })),
}));

vi.mock('@/ai/client', () => ({
  createGemini: vi.fn(() => ({})),
}));

vi.mock('@/ai/generate-article', () => ({
  generateArticleDraft: vi.fn(async () => ({
    title: 'テスト記事',
    markdownContent: '# テスト記事\n本文',
    excerpt: '抜粋',
    tags: ['タグA'],
    slug: 'test-article',
  })),
}));

vi.mock('@/lib/dynamodb', () => ({
  getDocClient: vi.fn(() => ({ send })),
  Tables: { articles: 'articles', articleTags: 'article_tags' },
}));

vi.mock('@/lib/origin', () => ({
  getPublicOrigin: vi.fn(() => 'https://example.com'),
}));

vi.mock('@/lib/env', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('https://example.com/api/admin/articles/generate', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const baseBody = {
  contentGoal: 'サーバーサイドレンダリングの利点を説明する記事を書く',
  context: 'ターゲット読者はジュニアのウェブ開発者である',
  access: 'free',
};

/** articles テーブルへの PutCommand を取り出す */
function findArticlePut() {
  return send.mock.calls
    .map((call) => call[0])
    .find((command) => command.input?.TableName === 'articles' && command.input?.Item);
}

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({});
});

describe('POST /api/admin/articles/generate — draftId', () => {
  it('指定された draftId をそのまま記事 ID として保存する', async () => {
    const draftId = '8f1c2e40-1111-4222-8333-944455556666';
    const { POST } = await import('@/app/api/admin/articles/generate/route');

    const res = await POST(makeRequest({ ...baseBody, draftId }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.articleId).toBe(draftId);
    expect(findArticlePut()?.input.Item.id).toBe(draftId);
  });

  it('UUID でない draftId は 400（任意文字列を PK にしない）', async () => {
    const { POST } = await import('@/app/api/admin/articles/generate/route');

    const res = await POST(makeRequest({ ...baseBody, draftId: 'not-a-uuid' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe('error');
    expect(findArticlePut()).toBeUndefined();
  });

  it('draftId 省略時はサーバー側で採番する（後方互換）', async () => {
    const { POST } = await import('@/app/api/admin/articles/generate/route');

    const res = await POST(makeRequest(baseBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.articleId).toBe('string');
    expect(body.articleId).toHaveLength(36);
    expect(findArticlePut()?.input.Item.id).toBe(body.articleId);
  });
});
