/**
 * 特定商取引法に基づく表記ページ
 */
import { getSiteSettings } from '@/lib/settings';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// why: CommonMark は閉じ ** の直前が「」（）などの CJK 約物で直後がひらがな等の場合に
//      強調として認識しない。日本語コンテンツでは **「用語」**のように が頻出するため
//      remark-cjk-friendly で補正する。非 CJK テキストへの影響はない。
import remarkCjkFriendly from 'remark-cjk-friendly';
import type { Metadata } from 'next';

// why: SSG されるとビルド時空 DB の HTML が固定化されるため、特定商記表記を
//      管理画面から更新しても反映されない。force-dynamic で毎回 DB を引くようにする。
//      詳細は privacy/page.tsx 参照。
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '特定商取引法に基づく表記',
  robots: {
    index: false, // 検索結果に表示しない
  },
};

export default async function LegalCommercePage() {
  const settings = await getSiteSettings();
  const content = settings?.legalCommerceContent || 'コンテンツが設定されていません。';

  return (
    <div className="page-section container--narrow">
      <h1>特定商取引法に基づく表記</h1>
      <hr className="separator" />
      <div className="article__content">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkCjkFriendly]}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
