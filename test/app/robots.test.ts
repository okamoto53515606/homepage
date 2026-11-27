/**
 * robots.txt 生成の回帰テスト
 *
 * why:
 *   robots.txt から機密パスの Disallow を「攻撃者に的を教えるだけ」と判断して
 *   削除してしまう事故を防ぐ。削除すると /payment/success?session_id=... や
 *   /auth/callback?... がインデックス対象に戻り、URL 中の識別子が検索結果へ露出する。
 */
import { describe, it, expect } from 'vitest';
import robots, { dynamic } from '@/app/robots';

describe('app/robots.ts', () => {
  it('ビルド時に CLOUDFRONT_DOMAIN 未設定のまま焼き付かないよう force-dynamic である', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('Sitemap 行を出力する', () => {
    const result = robots();
    expect(result.sitemap).toMatch(/\/sitemap\.xml$/);
  });

  it.each([
    '/admin/',
    '/api/',
    '/auth/',
    '/payment/',
    '/withdraw',
  ])('機密パス %s を Disallow している', (path) => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rule?.disallow).toContain(path);
  });

  it('本文はルートを許可する（記事一覧・記事ページをクロールさせる）', () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rule?.allow).toBe('/');
  });
});
