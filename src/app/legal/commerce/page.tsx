/**
 * 特定商取引法に基づく表記ページ
 */
import { getSiteSettings } from '@/lib/settings';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Metadata } from 'next';

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
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
