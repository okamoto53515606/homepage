/**
 * コメント API の認証 + 入力検証テスト
 *
 * why:
 *   コメント機能は未認証ユーザーでも GET でき、POST はログイン必須。
 *   - 未ログイン → 401
 *   - 不正な JSON → 400
 *   - 1000 文字超 → 400 (サーバー側 Zod 検証)
 *   - 空文字 → 400
 *   - <script> や javascript: URL を含む payload は **サーバーは保存するだけ**。
 *     表示時の rehype-sanitize がエスケープする責務（GET 結果に raw HTML が
 *     ブラウザで実行されないことは別途 e2e で確認）。
 *     ここでは「過大入力 / 無効 JSON / 認証欠落」のサーバーゲート箇所だけ守る。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  getUser: vi.fn(async () => ({ isLoggedIn: false, role: 'guest' })),
}));

vi.mock('@/lib/data', () => ({
  getArticleBySlug: vi.fn(async () => ({ id: 'art-1', slug: 'test' })),
  getCommentsForArticle: vi.fn(async () => []),
}));

vi.mock('@/lib/env', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  getRequestInfo: vi.fn(async () => ({ ip: '203.0.113.1', userAgent: 'vitest' })),
}));

vi.mock('@/lib/dynamodb', () => ({
  getDocClient: vi.fn(() => ({ send: vi.fn(async () => ({})) })),
  Tables: { comments: 'comments' },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const params = Promise.resolve({ slug: 'test' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/articles/[slug]/comments — 攻撃観点', () => {
  it('未ログインで POST → 401', async () => {
    const { POST } = await import('@/app/api/articles/[slug]/comments/route');
    const req = new NextRequest('https://example.com/api/articles/test/comments', {
      method: 'POST',
      body: JSON.stringify({ content: 'hi', articleId: 'art-1' }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
  });

  describe('ログイン済み', () => {
    beforeEach(async () => {
      const auth = await import('@/lib/auth');
      vi.mocked(auth.getUser).mockResolvedValue({
        isLoggedIn: true,
        uid: 'u1',
        name: 'Tester',
        email: 't@example.com',
        role: 'free_member',
      });
    });

    it('不正な JSON → 400', async () => {
      const { POST } = await import('@/app/api/articles/[slug]/comments/route');
      const req = new NextRequest('https://example.com/api/articles/test/comments', {
        method: 'POST',
        body: '{not-json',
      });
      const res = await POST(req, { params });
      expect(res.status).toBe(400);
    });

    it('1001 文字（上限超え） → 400', async () => {
      const { POST } = await import('@/app/api/articles/[slug]/comments/route');
      const req = new NextRequest('https://example.com/api/articles/test/comments', {
        method: 'POST',
        body: JSON.stringify({ content: 'a'.repeat(1001), articleId: 'art-1' }),
      });
      const res = await POST(req, { params });
      expect(res.status).toBe(400);
    });

    it('空文字 → 400', async () => {
      const { POST } = await import('@/app/api/articles/[slug]/comments/route');
      const req = new NextRequest('https://example.com/api/articles/test/comments', {
        method: 'POST',
        body: JSON.stringify({ content: '', articleId: 'art-1' }),
      });
      const res = await POST(req, { params });
      expect(res.status).toBe(400);
    });

    it('articleId 欠落 → 400', async () => {
      const { POST } = await import('@/app/api/articles/[slug]/comments/route');
      const req = new NextRequest('https://example.com/api/articles/test/comments', {
        method: 'POST',
        body: JSON.stringify({ content: 'hi' }),
      });
      const res = await POST(req, { params });
      expect(res.status).toBe(400);
    });

    it('XSS payload は受理される（サーバー保存）が、サニタイズは描画側責務', async () => {
      // why: ここでは「サーバーが 500 落ちしない」「Zod が機械的に許可する範囲を変えない」
      //      ことだけを担保する。HTML サニタイズの実機検証は e2e/視覚テストの担当。
      const { POST } = await import('@/app/api/articles/[slug]/comments/route');
      const req = new NextRequest('https://example.com/api/articles/test/comments', {
        method: 'POST',
        body: JSON.stringify({
          content: '<script>alert(1)</script>[click](javascript:alert(2))',
          articleId: 'art-1',
        }),
      });
      const res = await POST(req, { params });
      expect(res.status).toBe(200);
    });
  });
});
