/**
 * 公開サイトの絶対 URL（ビューワーが見る origin）を返す共通ヘルパー
 *
 * why:
 *   sitemap.xml / robots.txt は NextRequest を受け取らないため、既存の
 *   `getPublicOrigin(request)`（src/lib/origin.ts）を再利用できない。さらに
 *   CloudFront → Lambda Function URL 構成では originRequestPolicy が
 *   ALL_VIEWER_EXCEPT_HOST_HEADER なので、Lambda が受け取る host ヘッダーは
 *   Function URL 自身のドメインになり、リクエストからは公開ドメインを組み立てられない。
 *   したがって `CLOUDFRONT_DOMAIN`（setup1b / domain-rewrite-all が Lambda に注入）を正とする。
 *
 *   ローカル開発 (NODE_ENV !== 'production') で CLOUDFRONT_DOMAIN を無視する理由:
 *   .env に本番ドメインが残っていると、sitemap.xml に本番 URL が混ざり
 *   localhost での確認ができないため（origin.ts と同じ判定に揃える）。
 */

/** 開発時の既定 origin（package.json の `next dev -p 9002` と一致） */
const LOCAL_DEV_ORIGIN = 'http://localhost:9002';

/**
 * 末尾スラッシュなしの絶対 URL を返す（例: https://www.example.com）
 */
export function getSiteUrl(): string {
  if (process.env.NODE_ENV === 'production') {
    const cfDomain = process.env.CLOUDFRONT_DOMAIN;
    if (cfDomain) return `https://${cfDomain}`;
  }
  return LOCAL_DEV_ORIGIN;
}
