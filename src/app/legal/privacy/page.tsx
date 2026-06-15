/**
 * プライバシーポリシーページ
 */
import { getSiteSettings } from '@/lib/settings';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// why: CommonMark は閉じ ** の直前が「」（）などの CJK 約物で直後がひらがな等の場合に
//      強調として認識しない。日本語コンテンツでは **「用語」**のように が頻出するため
//      remark-cjk-friendly で補正する。非 CJK テキストへの影響はない。
import remarkCjkFriendly from 'remark-cjk-friendly';
import type { Metadata } from 'next';

// why: このページは cookies()/headers() を使わないため Next.js 16 のデフォルトでは
//      ビルド時に静的プリレンダリング（SSG）され、x-nextjs-prerender: 1 として
//      Lambda 内に固定 HTML が埋め込まれる。セットアップ時は DB が空のため
//      「コンテンツが設定されていません」の HTML が固定化され、その後 DB にあっても
//      无限に空のままになる。force-dynamic で毎回 DynamoDB を引くようにする。
//      （CloudFront 側のキャッシュは s-maxage/CDN 侧で維持されるためパフォーマンス影響は軽微）
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'プライバシーポリシー',
  robots: {
    index: false, // 検索結果に表示しない
  },
};

export default async function PrivacyPolicyPage() {
  const settings = await getSiteSettings();
  const content = settings?.privacyPolicyContent || 'コンテンツが設定されていません。';

  return (
    <div className="page-section container--narrow">
      <h1>プライバシーポリシー</h1>
      <hr className="separator" />
      <div className="article__content">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkCjkFriendly]}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
