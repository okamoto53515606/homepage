/**
 * 管理 API 認証ゲートのテスト
 *
 * why:
 *   /api/admin/* は Cognito 認証必須。getAdminUser() が isAuthenticated:false を
 *   返した場合に 403 を返すことを保証する。SAST だけでは「if 文を消してしまった」変更を
 *   見抜けないため、攻撃観点（cookie 無し）で実際に Route Handler を叩いて検証する。
 *
 *   getAdminUser を vi.mock で差し替えれば、JWKS / Cognito に依存せず純粋なゲート挙動だけ
 *   テストできる。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/admin-auth', () => ({
  getAdminUser: vi.fn(async () => ({ isAuthenticated: false })),
}));

vi.mock('@/lib/dynamodb', () => ({
  getDocClient: vi.fn(() => ({ send: vi.fn() })),
  Tables: {
    articles: 'articles',
    articleTags: 'article_tags',
    comments: 'comments',
    settings: 'settings',
    users: 'users',
    payments: 'payments',
    jobs: 'jobs',
  },
}));

vi.mock('@/lib/cloudfront', () => ({
  invalidateCloudFrontCache: vi.fn(async () => undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Admin API auth gate (no admin session → 403)', () => {
  it('DELETE /api/admin/articles → 403', async () => {
    const { DELETE } = await import('@/app/api/admin/articles/route');
    const req = new NextRequest('https://example.com/api/admin/articles?id=abc');
    const res = await DELETE(req);
    expect(res.status).toBe(403);
  });

  it('DELETE /api/admin/comments → 403', async () => {
    const { DELETE } = await import('@/app/api/admin/comments/route');
    const req = new NextRequest('https://example.com/api/admin/comments?id=c1&articleId=a1');
    const res = await DELETE(req);
    expect(res.status).toBe(403);
  });
});

describe('Admin API auth gate (authenticated admin → ID 必須チェック)', () => {
  beforeEach(async () => {
    const adminAuth = await import('@/lib/admin-auth');
    vi.mocked(adminAuth.getAdminUser).mockResolvedValue({
      isAuthenticated: true,
      email: 'admin@test.local',
      sub: 'admin-sub',
    });
  });

  it('DELETE /api/admin/articles without id → 400 (not 200, not 5xx)', async () => {
    const { DELETE } = await import('@/app/api/admin/articles/route');
    const req = new NextRequest('https://example.com/api/admin/articles');
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });

  it('DELETE /api/admin/comments without id → 400', async () => {
    const { DELETE } = await import('@/app/api/admin/comments/route');
    const req = new NextRequest('https://example.com/api/admin/comments');
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });
});
