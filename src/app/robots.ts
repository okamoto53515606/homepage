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
 *
 *   `disallow` に機密パスを列挙する理由（「攻撃者に的を教える」懸念への回答）:
 *     - `/admin/` `/api/` `/auth/` はクライアントバンドルの `fetchWithSigning('/api/...')` や
 *       一般的なスキャナのワードリストから元々容易に判明する。robots.txt を消しても
 *       攻撃面は減らず、推測不能なパス（例: `/internal-xxxx/`）だけが書くべきでない。
 *     - 一方で `/payment/success?session_id=cs_...` や `/auth/callback?...` は
 *       インデックスされると URL 中の識別子が検索結果へ露出する。列挙の実益がある。
 *     - ただし robots.txt はクロール抑止であり索引抑止ではないため、
 *       `/admin` `/payment` `/auth/callback` `/withdraw` 側で `robots: { index: false }` を
 *       併せて指定している（二重化）。
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
