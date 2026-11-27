/**
 * 機密ページの noindex メタデータ回帰テスト
 *
 * why:
 *   robots.txt の Disallow は「クロール抑止」であって「索引抑止」ではない。
 *   被リンクや外部からの参照があると URL だけは索引されうるため、
 *   識別子を URL に含むページ（決済・認証・退会）は noindex を必ず持たせる。
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/settings', () => ({
  getSiteSettings: vi.fn(async () => ({ siteName: 'テストサイト' })),
}));

describe('noindex メタデータ', () => {
  it('/payment/* はレイアウトで noindex を付与する（success は client component のため）', async () => {
    const { metadata } = await import('@/app/payment/layout');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('/auth/callback は noindex を付与する', async () => {
    const { metadata } = await import('@/app/auth/callback/page');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('/withdraw は generateMetadata で noindex を付与する', async () => {
    // why: page.tsx は @/lib/auth・next/navigation に依存するため重い。
    //      metadata の検証に必要な generateMetadata だけを対象にする。
    const { generateMetadata } = await import('@/app/withdraw/page');
    const metadata = await generateMetadata();
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
