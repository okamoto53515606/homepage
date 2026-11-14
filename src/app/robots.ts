/**
 * robots.txt の自動生成（Next.js MetadataRoute）
 *
 * why:
 *   sitemap.xml をクローラに発見してもらうには robots.txt の `Sitemap:` 行が必要。
 *   これまで robots.txt は存在せず、sitemap を置いても自動発見されなかった。
 *
 *   ドメインは実行時に決まる（setup1b が CLOUDFRONT_DOMAIN を Lambda に注入する）ため
 *   静的な public/robots.txt では表現できない。よってコード生成にする。
 *
 *   `dynamic = 'force-dynamic'` を付ける理由:
 *   ビルド時には CLOUDFRONT_DOMAIN が未設定で、付与しないと
 *   `Sitemap: http://localhost:9002/sitemap.xml` がイメージに焼き付く。
 *
 *   一覧系のクエリ（`?cursor=` / `?tag=`）は `Disallow` ではなく
 *   canonical（`/` や `/tags/<tag>` を指す）に集約させる方針なので、
 *   クエリ付き URL はそのまま許可する（重複コンテンツは canonical で解決）。
 */

import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/api/',
          '/auth/',
          '/payment/',
          '/withdraw',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
