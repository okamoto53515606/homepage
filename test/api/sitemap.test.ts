/**
 * sitemap.xml / robots.txt 生成の回帰テスト
 *
 * why:
 *   - sitemap は「公開記事を漏れなく・正しい絶対 URL で列挙する」ことが責務。
 *     URL が相対パスになった / 下書きが混ざった / タグが URL エンコードされていない
 *     といった不具合は、クローラからしか気づけない（画面では見えない）。
 *   - ベース URL は CLOUDFRONT_DOMAIN 依存で、開発時に .env へ本番ドメインが
 *     残っていても混入しないことを保証する（origin.ts と同じ判定）。
 *   - 管理画面・API・法務ページ（noindex）を sitemap に載せないことも固定する。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/data', () => ({
  getAllPublishedArticlesForSitemap: vi.fn(async () => [
    { slug: 'hello-world', updatedAt: '2026-11-01T00:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z' },
    { slug: 'only-created', createdAt: '2026-10-02T00:00:00.000Z' },
  ]),
  getAllTags: vi.fn(async () => [
    { name: 'AI', count: 3 },
    { name: '日本語 タグ', count: 1 },
  ]),
}));

const BASE = 'https://www.example.com';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('CLOUDFRONT_DOMAIN', 'www.example.com');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('app/sitemap.ts', () => {
  it('公開記事・タグを CLOUDFRONT_DOMAIN 基準の絶対 URL で列挙する', async () => {
    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toContain(`${BASE}/`);
    expect(urls).toContain(`${BASE}/articles/hello-world`);
    expect(urls).toContain(`${BASE}/articles/only-created`);
    // 日本語タグはパーセントエンコードされる（タグページは decodeURIComponent で照合）
    expect(urls).toContain(`${BASE}/tags/${encodeURIComponent('日本語 タグ')}`);
    expect(urls).toContain(`${BASE}/tags/AI`);

    // 相対 URL が混ざっていないこと（sitemap プロトコル違反）
    for (const url of urls) {
      expect(url.startsWith('https://')).toBe(true);
    }
  });

  it('lastModified は updatedAt を優先し、無ければ createdAt にフォールバックする', async () => {
    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();

    const updated = entries.find((e) => e.url.endsWith('/articles/hello-world'))!;
    const createdOnly = entries.find((e) => e.url.endsWith('/articles/only-created'))!;

    expect(new Date(updated.lastModified as string).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(new Date(createdOnly.lastModified as string).toISOString()).toBe('2026-10-02T00:00:00.000Z');
  });

  it('クロール不要 / noindex のページを含めない', async () => {
    const { default: sitemap } = await import('@/app/sitemap');
    const urls = (await sitemap()).map((e) => e.url);

    for (const path of ['/admin', '/api', '/auth', '/payment', '/withdraw', '/legal']) {
      expect(urls.some((url) => url.startsWith(`${BASE}${path}`))).toBe(false);
    }
  });

  it('DB 取得が空でもトップページだけは返す（サイト全体を 500 にしない）', async () => {
    const data = await import('@/lib/data');
    vi.mocked(data.getAllPublishedArticlesForSitemap).mockResolvedValueOnce([]);
    vi.mocked(data.getAllTags).mockResolvedValueOnce([]);

    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();

    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe(`${BASE}/`);
  });
});

describe('app/robots.ts', () => {
  it('sitemap の場所を宣言し、管理画面/API を Disallow する', async () => {
    const { default: robots } = await import('@/app/robots');
    const result = robots();

    expect(result.sitemap).toBe(`${BASE}/sitemap.xml`);

    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    const rule = rules.find((r) => r.userAgent === '*')!;
    const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];

    expect(disallow).toContain('/admin/');
    expect(disallow).toContain('/api/');
    expect(disallow).toContain('/auth/');
  });
});

describe('getSiteUrl()', () => {
  it('本番は CLOUDFRONT_DOMAIN から https の絶対 URL を組み立てる', async () => {
    const { getSiteUrl } = await import('@/lib/site-url');
    expect(getSiteUrl()).toBe(BASE);
  });

  it('開発時は .env の CLOUDFRONT_DOMAIN を無視して localhost を返す', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { getSiteUrl } = await import('@/lib/site-url');
    expect(getSiteUrl()).toBe('http://localhost:9002');
  });
});
