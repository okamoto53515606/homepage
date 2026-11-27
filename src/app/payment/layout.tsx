/**
 * 決済系ページ共通レイアウト（メタデータ専用）
 *
 * why:
 *   `/payment/success` は Stripe Checkout からの戻り先で、URL に
 *   `session_id=cs_...` を含む。これが検索結果に載るとセッション ID が
 *   第三者に露出する（DAST の 10024 Sensitive Information in URL と同種の問題）。
 *   同ページは `'use client'`（useSearchParams を使う）ためページ側で
 *   `metadata` を export できず、`layout.tsx` で noindex を付与する必要がある。
 *
 *   robots.txt の `Disallow: /payment/` は「クロール禁止」であって
 *   「インデックス禁止」ではない（被リンクがあると URL だけは索引されうる）。
 *   よって robots.txt と noindex の二重化で漏洩経路を塞ぐ。
 *   このレイアウトは /payment/cancel にも適用される（害はない）。
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function PaymentLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
