/**
 * 利用規約ページ
 */
import { getSiteSettings } from '@/lib/settings';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Metadata } from 'next';

// why: SSG されてしまうとビルド時空 DB の HTML が固定化されるため、使用規約を
//      管理画面から更新しても反映されない。force-dynamic で毎回 DB を引いて
//      常に最新の規約を返す。詳細は privacy/page.tsx 参照。
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '利用規約',
  robots: {
    index: false, // 検索結果に表示しない
  },
};

export default async function TermsOfServicePage() {
  const settings = await getSiteSettings();
  const content = settings?.termsOfServiceContent || 'コンテンツが設定されていません。';

  return (
    <div className="page-section container--narrow">
      <h1>利用規約</h1>
      <hr className="separator" />
      <div className="article__content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
