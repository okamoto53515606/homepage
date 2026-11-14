/**
 * sitemap.xml の自動生成（Next.js MetadataRoute）
 *
 * why:
 *   記事は DynamoDB に逐次追加されるため、静的な sitemap.xml をリポジトリに置くと
 *   すぐ陳腐化する。App Router の sitemap.ts（特殊な Route Handler）で
 *   公開記事・タグを DB から都度生成する。
 *
 *   `dynamic = 'force-dynamic'` を必ず付ける理由:
 *   sitemap.ts は既定でビルド時にキャッシュ（プリレンダリング）されるため、
 *   付与しないと「ビルド時点の DB 状態」＝ほぼ空の sitemap が Lambda イメージに
 *   焼き付き、以後 DB を更新しても古い sitemap が返り続ける
 *   （docs/operations_v2.md の force-dynamic 必須ルールと同じ理由）。
 *
 *   CloudFront 側は既定 Behavior（minTTL 1 時間）でキャッシュされるが、
 *   記事の追加・更新・削除時は invalidateCloudFrontCache() に `/sitemap.xml` を
 *   含めているので、公開操作の直後に更新される。
 *
 *   掲載対象:
 *     - `/`（トップ）
 *     - `/articles/<slug>`（公開記事。有料記事もタイトル・抜粋は公開されるため含める）
 *     - `/tags/<tag>`（タグ別一覧）
 *   除外:
 *     - `/legal/*`（各ページで `robots: { index: false }` を指定しており、sitemap に
 *       載せると「index しろ」と「するな」の矛盾になる）
 *     - `/admin/*`, `/api/*`, `/auth/*`, `/payment/*`, `/withdraw`（クロール不要）
 */

import type { MetadataRoute } from 'next';
import { getAllPublishedArticlesForSitemap, getAllTags } from '@/lib/data';
import { getSiteUrl } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();

  // why: 記事とタグは互いに独立した読み取りなので並列で取得する
  //      （sitemap は CloudFront のキャッシュミス時のみ Lambda を叩くが、
  //        それでも初回応答を遅らせないため）。
  const [articles, tags] = await Promise.all([
    getAllPublishedArticlesForSitemap(),
    getAllTags(),
  ]);

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      changeFrequency: 'daily',
      priority: 1,
    },
  ];

  for (const article of articles) {
    entries.push({
      url: `${baseUrl}/articles/${encodeURIComponent(article.slug)}`,
      lastModified: article.updatedAt || article.createdAt,
      changeFrequency: 'weekly',
      priority: 0.8,
    });
  }

  for (const tag of tags) {
    // why: 日本語タグは URL ではパーセントエンコードされる。タグページ側は
    //      decodeURIComponent して検索するため、ここで encode しておけば一致する。
    entries.push({
      url: `${baseUrl}/tags/${encodeURIComponent(tag.name)}`,
      changeFrequency: 'weekly',
      priority: 0.5,
    });
  }

  return entries;
}
